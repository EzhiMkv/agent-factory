#!/usr/bin/env node
// Оркестратор конвейера: очередь тикетов из openspec/*/tasks.md +
// запуск агентов в изолированных git worktrees.
//
//   node orchestrator/index.mjs list                          — очередь тикетов
//   node orchestrator/index.mjs claim --ticket 001-tc-01      — занять тикет (worktree+ветка)
//   node orchestrator/index.mjs board                         — статус занятий тикетов
//   node orchestrator/index.mjs snapshot                      — путь до текущей очереди для UI
//
// Запуск самих агентов — по AGENT_CMD (пример в orchestrator/README.md);
// здесь только очередь, ветки и worktrees — тонкий слой без магии.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OPENSPEC = path.join(ROOT, "openspec", "changes");
const WORKTREES = path.join(ROOT, "worktrees");

export function readQueue() {
  if (!fs.existsSync(OPENSPEC)) return [];
  const queue = [];
  for (const change of fs.readdirSync(OPENSPEC).sort()) {
    const tasksPath = path.join(OPENSPEC, change, "tasks.md");
    if (!fs.existsSync(tasksPath)) continue;
    let section = "";
    for (const line of fs.readFileSync(tasksPath, "utf8").split("\n")) {
      const h = line.match(/^##\s+(tc-\d+)/);
      if (h) {
        section = h[1];
        continue;
      }
      if (line.startsWith("## ")) section = ""; // прочие секции (DoD) не тикеты
      const m = line.match(/^\s*-\s+\[([ xX])\]\s+(.*)/);
      if (!m || !section) continue;
      const done = m[1] !== " ";
      const slug = slugify(m[2]);
      queue.push({
        id: `${change.replace(/\D.*$/, "")}-${section}`,
        change,
        section,
        slug,
        done,
        text: m[2].trim(),
        tasksPath,
      });
    }
  }
  return queue;
}

export function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split("-")
      .slice(0, 4)
      .join("-") || "ticket"
  );
}

function branchFor(t) {
  return `work/${t.change}/${t.section}`;
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts });
}

export function claim(ticketId) {
  const q = readQueue();
  const t = q.find((x) => x.id === ticketId);
  if (!t) throw new Error(`тикет ${ticketId} не найден в openspec (см. list)`);
  const branch = branchFor(t);
  const wt = path.join(WORKTREES, `${t.change}-${t.section}`);
  const exists = fs.existsSync(wt);
  let branchInfo = "";
  try {
    branchInfo = sh(`git -C ${ROOT} rev-parse --verify ${branch}`).trim();
  } catch {
    branchInfo = "";
  }
  if (!exists) {
    if (branchInfo) {
      sh(`git -C ${ROOT} worktree add ${wt} ${branch}`);
    } else {
      sh(`git -C ${ROOT} worktree add -b ${branch} ${wt}`);
    }
  }
  return { ticket: t, branch, worktree: wt, existed: exists };
}

export function board() {
  const q = readQueue();
  const rows = q.map((t) => {
    const branch = branchFor(t);
    let state = t.done ? "done" : "open";
    try {
      sh(`git -C ${ROOT} rev-parse --verify ${branch}`);
      state = t.done ? "merged?" : "claimed";
    } catch {}
    const wt = path.join(WORKTREES, `${t.change}-${t.section}`);
    if (fs.existsSync(wt)) state += "+wt";
    return { id: t.id, state, text: t.text };
  });
  return rows;
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "list": {
    const q = readQueue();
    for (const t of q) {
      console.log(`${t.done ? "x" : " "}[${t.id}] ${t.text}`);
    }
    console.log(`\nитого: ${q.length}, закрыто: ${q.filter((x) => x.done).length}`);
    break;
  }
  case "claim": {
    const id = args.find((a) => a.startsWith("--ticket"))?.split("=")[1]
      ?? args[args.indexOf("--ticket") + 1];
    const { ticket, branch, worktree } = claim(id);
    console.log(`тикет   ${ticket.id}`);
    console.log(`ветка   ${branch}`);
    console.log(`worktree ${worktree}`);
    console.log(`AGENTS.md читай, план тикета пиши в docs/runs/.`);
    break;
  }
  case "board": {
    for (const r of board()) console.log(`${r.state.padEnd(12)} ${r.id}  ${r.text}`);
    break;
  }
  case "snapshot": {
    console.log(JSON.stringify({ queue: readQueue(), board: board() }, null, 2));
    break;
  }
  default:
    console.error("команды: list | claim --ticket <id> | board | snapshot");
    process.exit(1);
}
