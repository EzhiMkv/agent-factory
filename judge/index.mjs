#!/usr/bin/env node
// Judge-gate: дифф тикета → judge-LLM → вердикт approve/request-changes.
//
//   node judge/index.mjs --branch work/001/tc-04 [--base main] [--out judge/results/…]
//
// Конфиг: JUDGE_API_KEY / JUDGE_BASE_URL / JUDGE_MODEL (.env.example).
// Судья должен быть ОТ ДРУГОГО вендора, чем кодящий агент.
// Прод-версия (v2): авто-комментарий в PR и блокировка мержа.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROMPT_PATH = path.join(ROOT, "judge", "prompt.md");

function sh(cmd) {
  return { out: execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }) };
}
import { execSync } from "node:child_process";

function parseArgs(argv) {
  const o = { base: "main" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--branch") o.branch = argv[++i];
    else if (a === "--base") o.base = argv[++i];
    else if (a === "--out") o.out = argv[++i];
  }
  if (!o.branch) throw new Error("--branch обязателен");
  return o;
}

async function judgeClient() {
  const key = process.env.JUDGE_API_KEY;
  const base = (process.env.JUDGE_BASE_URL ?? "").replace(/\/$/, "");
  const model = process.env.JUDGE_MODEL;
  if (!key || !base || !model) {
    throw new Error("JUDGE_API_KEY / JUDGE_BASE_URL / JUDGE_MODEL не заданы — см. .env.example");
  }
  return async (userContent) => {
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: fs.readFileSync(PROMPT_PATH, "utf8") },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!resp.ok) {
      throw new Error(`judge http ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? "";
  };
}

function parseVerdict(text) {
  const m = text.match(/VERDICT:\s*(approve|request-changes)/i);
  return m ? m[1].toLowerCase() : "request-changes"; // молчит = не прошёл
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  sh(`git -C ${ROOT} fetch . ${opts.branch}:${opts.branch}-tmp 2>/dev/null || true`);
  const diff = sh(`git -C ${ROOT} diff ${opts.base}...${opts.branch}`).out;
  if (!diff.trim()) {
    console.log("VERDICT: request-changes");
    console.log("NOTES: дифф пуст — тикет не содержит изменений.");
    process.exit(1);
  }
  console.error(`дифф: ${diff.split("\n").length} строк, ветка ${opts.branch} против ${opts.base}`);
  const ask = await judgeClient();
  const userContent = [
    `ТИКЕТ: ветка ${opts.branch}`,
    `RULES из AGENTS.md появляются в system.`,
    `Дифф:`,
    "```diff",
    diff.slice(0, 60_000), // судья читает первые 60к символов; остальное — в заметки
    "```",
  ].join("\n");
  const answer = await ask(userContent);
  const verdict = parseVerdict(answer);

  if (opts.out || true) {
    const dir = path.join(ROOT, "judge", "results");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${new Date().toISOString().slice(0, 19)}-${opts.branch.replaceAll("/", "_")}.md`);
    fs.writeFileSync(
      file,
      `# judge ${new Date().toISOString()}\n\nbranch: ${opts.branch}\nbase: ${opts.base}\nverdict: ${verdict}\n\n${answer}\n`,
    );
    console.error(`отчёт: ${file}`);
  }

  console.log(`VERDICT: ${verdict}`);
  console.log(answer);
  process.exitCode = verdict === "approve" ? 0 : 1;
}

main().catch((err) => {
  console.error("judge упал:", err.message);
  process.exit(2);
});
