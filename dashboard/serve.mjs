#!/usr/bin/env node
// Живой дашборд: страница опрашивает /api/data, сервер каждый раз собирает
// свежий срез из тех же источников, что и build.mjs. Ноль зависимостей.
//
//   node dashboard/serve.mjs          → http://localhost:4173
//   PORT=5000 node dashboard/serve.mjs
//
// Пульт: POST-эндпоинты пишут галочки/порядок в tasks.md, делают claim
// у orchestrator'а и запускают judge по ветке тикета. Секреты судьи читаются
// из корневого .env и живут только в env дочернего процесса judge.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execSync, spawn } from "node:child_process";
import { collectData, setTicketDone, setTicketOrder } from "./build.mjs";

const INDEX = path.join(import.meta.dirname, "index.html");
const ROOT = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT ?? 4173);

const judgeJobs = new Map(); // id тикета → время старта; судья думает

function withJobs(d) {
  d.judgeRunning = [...judgeJobs.keys()];
  return d;
}

function loadDotEnv() {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      const eq = s.indexOf("=");
      if (eq <= 0) continue;
      out[s.slice(0, eq).trim()] = s.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}

function json(res, code, obj) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

function readBody(req, cb) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 10_000) req.destroy();
  });
  req.on("end", () => cb(body));
}

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname === "/api/data") {
      try {
        json(res, 200, withJobs(collectData()));
      } catch (err) {
        json(res, 500, { error: err.message });
      }
      return;
    }
    if (pathname === "/api/ticket-toggle" && req.method === "POST") {
      readBody(req, (body) => {
        try {
          const t = JSON.parse(body);
          const okShape =
            typeof t.change === "string" && /^[\w-]+$/.test(t.change) &&
            typeof t.section === "string" && /^tc-\d+$/.test(t.section) &&
            typeof t.text === "string" && t.text.length > 0 && t.text.length <= 500 &&
            typeof t.done === "boolean";
          if (!okShape) throw new Error("кривой запрос");
          setTicketDone(t);
          json(res, 200, { ok: true, data: withJobs(collectData()) });
        } catch (err) {
          json(res, 400, { ok: false, error: err.message });
        }
      });
      return;
    }
    if (pathname === "/api/ticket-move" && req.method === "POST") {
      readBody(req, (body) => {
        try {
          const t = JSON.parse(body);
          const okShape =
            typeof t.change === "string" && /^[\w-]+$/.test(t.change) &&
            typeof t.section === "string" && /^tc-\d+$/.test(t.section) &&
            typeof t.text === "string" && t.text.length > 0 && t.text.length <= 500 &&
            (t.place === "next" || t.place === "queue");
          if (!okShape) throw new Error("кривой запрос");
          setTicketDone({ change: t.change, section: t.section, text: t.text, done: false });
          setTicketOrder(t);
          json(res, 200, { ok: true, data: withJobs(collectData()) });
        } catch (err) {
          json(res, 400, { ok: false, error: err.message });
        }
      });
      return;
    }
    if (pathname === "/api/ticket-claim" && req.method === "POST") {
      readBody(req, (body) => {
        try {
          const q = JSON.parse(body);
          if (typeof q.id !== "string" || !/^[\w-]+-tc-\d+$/.test(q.id)) {
            throw new Error("кривой запрос");
          }
          const t = withJobs(collectData()).queue.find((x) => x.id === q.id);
          if (!t) throw new Error("тикет не найден");
          if (t.done) throw new Error("тикет закрыт — claim не нужен");
          sh(`node orchestrator/index.mjs claim --ticket ${JSON.stringify(q.id)}`);
          json(res, 200, { ok: true, data: withJobs(collectData()) });
        } catch (err) {
          json(res, 400, { ok: false, error: String(err.stderr || "").trim() || err.message });
        }
      });
      return;
    }
    if (pathname === "/api/judge-run" && req.method === "POST") {
      readBody(req, (body) => {
        try {
          const q = JSON.parse(body);
          if (typeof q.id !== "string" || !/^[\w-]+-tc-\d+$/.test(q.id)) {
            throw new Error("кривой запрос");
          }
          if (judgeJobs.has(q.id)) throw new Error("судья уже смотрит этот тикет");
          const data = withJobs(collectData());
          const t = data.queue.find((x) => x.id === q.id);
          if (!t) throw new Error("тикет не найден");
          const branch = `work/${t.change}/${t.section}`;
          try {
            sh(`git -C ${ROOT} rev-parse --verify ${branch}`);
          } catch {
            throw new Error(`ветки ${branch} ещё нет — сначала claim и коммиты агента`);
          }
          judgeJobs.set(q.id, Date.now());
          const child = spawn("node", ["judge/index.mjs", "--branch", branch], {
            cwd: ROOT,
            env: { ...process.env, ...loadDotEnv() },
            stdio: ["ignore", "pipe", "pipe"],
          });
          let tail = "";
          child.stdout.on("data", (d) => { tail = (tail + d).slice(-4000); });
          child.stderr.on("data", (d) => { tail = (tail + d).slice(-4000); });
          child.on("error", (e) => {
            judgeJobs.delete(q.id);
            console.error(`judge ${q.id}: spawn error: ${e.message}`);
          });
          child.on("close", (code) => {
            judgeJobs.delete(q.id);
            console.log(
              `judge ${q.id} (${branch}): exit ${code}${code === 0 ? "" : " :: " + tail.slice(-300)}`,
            );
          });
          json(res, 200, { ok: true, running: true, data: withJobs(collectData()) });
        } catch (err) {
          json(res, 400, { ok: false, error: err.message });
        }
      });
      return;
    }
    if (pathname === "/" || pathname === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(INDEX));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("не то место — дашборд отдаёт /, /api/data и POST на /api/ticket-toggle, /api/ticket-move, /api/ticket-claim, /api/judge-run");
  })
  .listen(port, () => {
    console.log(`живой дашборд: http://localhost:${port}`);
  });
