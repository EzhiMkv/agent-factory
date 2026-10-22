#!/usr/bin/env node
// Генератор дашборда конвейера: живые данные → dashboard/index.html.
//
//   node dashboard/build.mjs      — пересобрать index.html + metrics/*.json
//   node dashboard/serve.mjs      — живой режим (страница сама подтягивает
//                                   свежий срез; сервер собирает его здесь)
//
// Собирает: очередь тикетов (orchestrator snapshot), вердикты judge/results,
// журнал docs/runs, адреса живого деплоя. Страница самодостаточна: без сети
// и зависимостей, открывается офлайн с последним собранным срезом.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const RESULTS = path.join(ROOT, "judge", "results");
const RUNS = path.join(ROOT, "docs", "runs");
const METRICS = path.join(ROOT, "dashboard", "metrics");

const DEPLOY = {
  network: "Base Sepolia (chain 84532)",
  contracts: [
    { name: "Critter", address: "0xf9cC9371d6392de66Cb1BA4Caef1e90F9d3A6b1A" },
    { name: "Registry (ERC-6551)", address: "0x5d8Cdad3D38E7921720F74018B7eBfbf788aFDcb" },
    { name: "TBA кошелёк пухлика", address: "0xf44B34bf267fD2735fD31F3F1A9a100d57a0A596" },
    { name: "Achievements", address: "0x8Af3ef94e6D2881e1ADFDE6c7eb0b4fEA416D2CB" },
  ],
  wallet: { name: "Демо-кошелёк (burner)", address: "0xae887A5712132C7cC1f62127AB1A1f8f03A91413" },
};

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
}

function collectSnapshot() {
  return JSON.parse(sh("node orchestrator/index.mjs snapshot"));
}

function collectJudge() {
  if (!fs.existsSync(RESULTS)) return [];
  return fs
    .readdirSync(RESULTS)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const text = fs.readFileSync(path.join(RESULTS, f), "utf8");
      const verdict = text.match(/^verdict:\s*(\S+)/m)?.[1] ?? "unknown";
      const branch = text.match(/^branch:\s*(.+)$/m)?.[1]?.trim() ?? "?";
      return { date: f.slice(0, 19).replace("T", " "), branch, verdict };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function collectRuns() {
  if (!fs.existsSync(RUNS)) return [];
  return fs
    .readdirSync(RUNS)
    .filter((f) => f.endsWith(".md") && f !== "TEMPLATE.md")
    .sort()
    .reverse()
    .map((f) => f.replace(/\.md$/, ""));
}

// Пульт: поставить/снять галочку тикета в tasks.md спеки.
// Ищем строку чекбокса внутри секции тикета с точно таким же текстом.
export function setTicketDone({ change, section, text, done }) {
  const tasksPath = path.join(ROOT, "openspec", "changes", change, "tasks.md");
  const lines = fs.readFileSync(tasksPath, "utf8").split("\n");
  let current = "";
  let hit = -1;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^##\s+(tc-\d+)/);
    if (h) {
      current = h[1];
      continue;
    }
    if (lines[i].startsWith("## ")) current = "";
    if (current !== section) continue;
    const m = lines[i].match(/^(\s*-\s+)\[([ xX])\]\s+(.*)$/);
    if (m && m[3].trim() === text.trim()) {
      hit = i;
      break;
    }
  }
  if (hit === -1) throw new Error(`пункт тикета ${section} не найден в ${tasksPath}`);
  lines[hit] = lines[hit].replace(/^(\s*-\s+)\[[ xX]\]/, `$1[${done ? "x" : " "}]`);
  fs.writeFileSync(tasksPath, lines.join("\n"));
  return { tasksPath: path.relative(ROOT, tasksPath) };
}

// Пульт: переставить секцию тикета в tasks.md — «next» ставит её первой
// открытой (станет «следующей»), «queue» — в конец очереди открытых.
// Секция = заголовок ## tc-XX плюс его строки до следующего ##; прочие
// ## -секции (DoD и т.п.) в очередь не попадают.
export function setTicketOrder({ change, section, place }) {
  if (place !== "next" && place !== "queue") throw new Error("place: next|queue");
  const tasksPath = path.join(ROOT, "openspec", "changes", change, "tasks.md");
  const lines = fs.readFileSync(tasksPath, "utf8").split("\n");
  const head = (l) => l.match(/^##\s+(tc-\d+)/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const h = head(lines[i]);
    if (h && h[1] === section) {
      start = i;
      break;
    }
  }
  if (start === -1) throw new Error(`секция ${section} не найдена в ${tasksPath}`);
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end++;
  const block = lines.splice(start, end - start);

  const openIdx = [];
  let cur = "";
  for (let i = 0; i < lines.length; i++) {
    const h = head(lines[i]);
    if (h) cur = h[1];
    else if (lines[i].startsWith("## ")) cur = "";
    else if (cur && /^\s*-\s+\[ \]/.test(lines[i])) openIdx.push(i);
  }

  // край области тикетов: перед первой нетикетной ## -секцией, иначе конец файла
  let areaEnd = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("## ") && !head(lines[i])) {
      areaEnd = i;
      break;
    }
  }

  let at = areaEnd;
  if (openIdx.length) {
    if (place === "next") {
      at = openIdx[0];
      while (at > 0 && !head(lines[at])) at--;
    } else {
      at = openIdx[openIdx.length - 1] + 1;
      while (at < lines.length && !lines[at].startsWith("## ")) at++;
    }
  }
  lines.splice(at, 0, ...block);
  fs.writeFileSync(tasksPath, lines.join("\n"));
  return { tasksPath: path.relative(ROOT, tasksPath), place };
}

export function collectData() {
  const snapshot = collectSnapshot();
  const judge = collectJudge();
  const runs = collectRuns();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const stateById = new Map(snapshot.board.map((b) => [b.id, b.state]));
  return {
    generatedAt: stamp,
    queue: snapshot.queue.map(({ id, done, text, change, section }) => ({
      id,
      done,
      text,
      change,
      section,
      state: stateById.get(id) ?? (done ? "done" : "open"),
    })),
    judge,
    runs: runs.slice(0, 8),
    runsTotal: runs.length,
    deploy: DEPLOY,
  };
}

function writeOutputs(data) {
  fs.mkdirSync(METRICS, { recursive: true });
  const day = data.generatedAt.slice(0, 10);
  fs.writeFileSync(path.join(METRICS, `${day}-snapshot.json`), JSON.stringify(data, null, 2));
  const safeJson = JSON.stringify(data).replace(/</g, "\\u003c");
  fs.writeFileSync(path.join(ROOT, "dashboard", "index.html"), renderHtml(safeJson));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const data = collectData();
  writeOutputs(data);
  const done = data.queue.filter((t) => t.done).length;
  const approved = data.judge.filter((r) => r.verdict === "approve").length;
  const returned = data.judge.filter((r) => r.verdict === "request-changes").length;
  console.log(
    `дашборд: dashboard/index.html — тикеты ${done}/${data.queue.length}, judge approve ${approved} / request-changes ${returned}, прогонов ${data.runsTotal}`,
  );
}

function renderHtml(json) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Пухляндия — конвейер</title>
<style>
  :root {
    --bg: #fdf6f4; --card: #ffffff; --ink: #4a4458; --soft: #8d86a0;
    --mint: #d5f0e3; --mint-ink: #2e7d5b; --peach: #ffe3d4; --peach-ink: #c96a3d;
    --lav: #ece6fa; --lav-ink: #6d5bb8; --line: #f0e6e2;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.5 "Segoe UI", system-ui, -apple-system, sans-serif; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 20px 56px; }
  header { display: flex; align-items: center; gap: 18px; margin-bottom: 26px; }
  header h1 { font-size: 24px; margin: 0 0 4px; }
  header p { margin: 0; color: var(--soft); font-size: 14px; }
  .sync { font-size: 12.5px !important; }
  .sync i { display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    background: var(--mint-ink); margin-right: 6px; animation: pulse 2s infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .card { background: var(--card); border-radius: 18px; padding: 20px 22px;
    margin-bottom: 18px; box-shadow: 0 2px 10px rgba(120, 90, 80, 0.06); }
  .card h2 { font-size: 16px; margin: 0 0 14px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .stat { background: var(--bg); border-radius: 14px; padding: 14px 16px; }
  .stat b { display: block; font-size: 26px; }
  .stat span { color: var(--soft); font-size: 13px; }
  .bar { height: 10px; border-radius: 5px; background: var(--lav); overflow: hidden; margin-top: 12px; }
  .bar i { display: block; height: 100%; background: var(--mint-ink); border-radius: 5px;
    transition: width 0.6s ease; }
  .chip { display: inline-block; padding: 2px 10px; border-radius: 999px;
    font-size: 12px; font-weight: 600; white-space: nowrap; }
  .chip.ok { background: var(--mint); color: var(--mint-ink); }
  .chip.open { background: var(--lav); color: var(--lav-ink); }
  .chip.hot { background: var(--peach); color: var(--peach-ink); }
  .mini { margin-left: auto; padding: 2px 10px; border: 0; border-radius: 999px;
    background: var(--lav); color: var(--lav-ink); font-size: 12px; font-weight: 600;
    font-family: inherit; cursor: pointer; white-space: nowrap; }
  .mini:hover { filter: brightness(0.94); }
  .mini:disabled { opacity: 0.5; cursor: wait; }
  .party { background: var(--mint); color: var(--mint-ink); border-radius: 14px;
    padding: 12px 18px; margin-bottom: 18px; font-weight: 600; text-align: center;
    animation: pop 0.4s ease; }
  @keyframes pop { from { transform: scale(0.96); opacity: 0; } }
  .hidden { display: none; }
  .row { display: flex; align-items: baseline; gap: 10px; padding: 7px 0;
    border-top: 1px solid var(--line); }
  .row:first-child { border-top: 0; }
  .row .id { font-family: ui-monospace, monospace; font-size: 13px; color: var(--soft);
    min-width: 86px; }
  .row.done .text { color: var(--soft); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .kanban { display: grid; grid-template-columns: 1.15fr 1fr 1fr 1fr; gap: 14px; align-items: start; }
  .kcol { background: var(--bg); border-radius: 14px; padding: 12px 12px 6px; }
  .kcol h3 { display: flex; justify-content: space-between; align-items: baseline;
    margin: 2px 4px 10px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px;
    text-transform: uppercase; color: var(--soft); }
  .kcol h3 b { color: var(--ink); }
  .kcol.nextcol h3 { color: var(--peach-ink); }
  .kcard { background: var(--card); border-radius: 12px; padding: 10px 12px 8px;
    margin-bottom: 10px; box-shadow: 0 1px 6px rgba(120, 90, 80, 0.05); cursor: grab; }
  .kcard .tid { display: flex; align-items: center; gap: 8px;
    font-family: ui-monospace, monospace; font-size: 12px; color: var(--soft); }
  .kcard p { margin: 6px 0 4px; font-size: 13.5px; line-height: 1.45; }
  .kcard.done { opacity: 0.75; }
  .kcard.done p { color: var(--soft); }
  .kcard.next { border: 1.5px solid var(--peach-ink);
    box-shadow: 0 3px 12px rgba(201, 106, 61, 0.12); }
  .kcard.next .tid { color: var(--peach-ink); font-weight: 700; }
  .actions { display: flex; justify-content: flex-end; padding-top: 4px; }
  .empty { color: var(--soft); font-size: 13px; margin: 0 4px 10px; }
  .kbody { max-height: 430px; overflow-y: auto; }
  .kcard.dragging { opacity: 0.45; }
  .kcol.over { outline: 2px dashed var(--lav-ink); outline-offset: -5px; }
  .chip.think { background: var(--peach); color: var(--peach-ink); animation: pulse 1.2s infinite; }
  @media (max-width: 760px) { .kanban { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 700px) { .cols, .stats, .kanban { grid-template-columns: 1fr; } }
  .addr { font-family: ui-monospace, monospace; font-size: 12.5px; }
  .addr a { color: var(--lav-ink); text-decoration: none; }
  .addr a:hover { text-decoration: underline; }
  .muted { color: var(--soft); font-size: 13px; }
  footer { margin-top: 26px; color: var(--soft); font-size: 13px; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="38" rx="23" ry="19" fill="#ffd9cc"/>
      <ellipse cx="32" cy="44" rx="14" ry="8" fill="#fff0e8" opacity="0.7"/>
      <circle cx="24" cy="34" r="4.6" fill="#3b3348"/>
      <circle cx="40" cy="34" r="4.6" fill="#3b3348"/>
      <circle cx="25.6" cy="32.4" r="1.6" fill="#fff"/>
      <circle cx="41.6" cy="32.4" r="1.6" fill="#fff"/>
      <ellipse cx="17" cy="40" rx="3.2" ry="2" fill="#ffb8a6"/>
      <ellipse cx="47" cy="40" rx="3.2" ry="2" fill="#ffb8a6"/>
      <path d="M29 43 q3 3 6 0" stroke="#3b3348" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </svg>
    <div>
      <h1>Конвейер «Пухляндии»</h1>
      <p id="cut">срез от …</p>
      <p class="sync muted"><i></i><span id="sync">живой режим: опрос каждые 4с</span></p>
    </div>
  </header>

  <div id="party" class="party hidden">Все тикеты закрыты — конвейер отработал полный цикл, пухлик доволен :3</div>

  <section class="stats card">
    <div class="stat"><b id="stat-tickets">…</b><span>тикетов закрыто</span></div>
    <div class="stat"><b id="stat-judge">…</b><span>судья: approve / вернули на добор</span></div>
    <div class="stat"><b id="stat-runs">…</b><span>логов прогонов агентов</span></div>
    <div style="grid-column: 1 / -1;">
      <div class="bar"><i id="bar" style="width:0%"></i></div>
    </div>
  </section>

  <section class="card">
    <h2>Канбан конвейера</h2>
    <div id="kanban" class="kanban"></div>
    <p class="muted">перетащи карточку: «Готово» — закрыть, «Следующая»/«Очередь» — порядок очереди из tasks.md, «В работе» — claim (ветка + worktree); кнопка «судье» запускает judge по ветке тикета</p>
  </section>

  <div class="cols">
    <section class="card">
      <h2>Судья · последние вердикты</h2>
      <div id="judge"></div>
      <p class="muted">судья — модель другого вендора, чем кодящий агент</p>
    </section>
    <section class="card">
      <h2>Журнал прогонов · docs/runs</h2>
      <div id="runs"></div>
      <p class="muted">каждый прогон агента описан по шаблону — читается глазами</p>
    </section>
  </div>

  <section class="card">
    <h2>Живой деплой · <span id="net"></span></h2>
    <div id="deploy"></div>
  </section>

  <footer>пересобрать срез: <code>node dashboard/build.mjs</code> · живой режим: <code>node dashboard/serve.mjs</code></footer>
</div>
<script>
let DATA = ${json};
const KEY = (d) => JSON.stringify([d.queue, d.judge, d.runs, d.runsTotal, d.judgeRunning || []]);
let lastKey = KEY(DATA);
let dragId = null;

function applyData(d) {
  DATA = d;
  lastKey = KEY(d);
  if (!dragId) render();
}

function render() {
  const done = DATA.queue.filter((t) => t.done).length;
  const approved = DATA.judge.filter((r) => r.verdict === "approve").length;
  const returned = DATA.judge.filter((r) => r.verdict === "request-changes").length;
  document.getElementById("cut").textContent = "спеки → тикеты → параллельные агенты → judge-ревью → мерж · срез от " + DATA.generatedAt;
  document.getElementById("stat-tickets").textContent = done + "/" + DATA.queue.length;
  document.getElementById("stat-judge").textContent = approved + " / " + returned;
  document.getElementById("stat-runs").textContent = DATA.runsTotal;
  document.getElementById("bar").style.width = Math.round((done / DATA.queue.length) * 100) + "%";
  document.getElementById("net").textContent = DATA.deploy.network;
  document.getElementById("party").classList.toggle("hidden", done !== DATA.queue.length);

  const live = location.protocol !== "file:";
  const clean = (s) => s.replace(/\\*\\*/g, "").replace("[hot]", "").trim();
  const next = DATA.queue.find((t) => !t.done);
  const inProgress = DATA.queue.filter(
    (t) => !t.done && t.state.startsWith("claimed") && t.id !== next?.id,
  );
  const backlog = DATA.queue.filter(
    (t) => !t.done && !t.state.startsWith("claimed") && t.id !== next?.id,
  );
  const finished = DATA.queue.filter((t) => t.done);

  const card = (t, extra) => {
    const hot = t.text.includes("[hot]");
    const claimed = !t.done && (t.state || "").startsWith("claimed");
    const thinking = (DATA.judgeRunning || []).includes(t.id);
    return '<div class="kcard ' + (extra === "next" ? "next" : "") + (t.done ? " done" : "")
      + '" data-id="' + t.id + '"' + (live ? ' draggable="true"' : "") + '>'
      + '<div class="tid">' + t.id
      + (hot ? '<span class="chip hot">hot</span>' : "")
      + (claimed ? '<span class="chip open">worktree</span>' : "")
      + (thinking ? '<span class="chip think">судья думает…</span>' : "")
      + '</div>'
      + '<p>' + clean(t.text) + '</p>'
      + (live ? '<div class="actions">'
        + (claimed && !thinking ? '<button class="mini judge" data-id="' + t.id
          + '" title="запустить judge по ветке тикета">судье</button>' : "")
        + '<button class="mini" data-id="' + t.id + '">'
        + (t.done ? "переоткрыть" : "закрыть") + '</button>'
        + '</div>' : '')
      + '</div>';
  };
  const col = (title, items, extra) => {
    const dcol = extra === "nextcol" ? "next" : extra === "claimed" ? "work"
      : extra === "donecol" ? "done" : "queue";
    return '<div class="kcol ' + (extra || "") + '" data-col="' + dcol + '"><h3><span>' + title
      + '</span><b>' + items.length + '</b></h3>'
      + (extra === "donecol" ? '<div class="kbody">' : "")
      + (items.map((t) => card(t, extra === "donecol" ? "" : extra === "nextcol" ? "next" : extra)).join("")
        || '<p class="empty">' + (extra === "nextcol" ? "все закрыты :3" : "—") + '</p>')
      + (extra === "donecol" ? '</div>' : "")
      + '</div>';
  };

  document.getElementById("kanban").innerHTML =
    col("Следующая", next ? [next] : [], "nextcol")
    + col("Очередь", backlog)
    + col("В работе", inProgress, "claimed")
    + col("Готово", finished, "donecol");

  document.getElementById("judge").innerHTML = DATA.judge.slice(0, 7).map((r) => {
    const ok = r.verdict === "approve";
    return '<div class="row"><span class="id">' + r.date.slice(5, 16) + '</span>'
      + '<span class="chip ' + (ok ? "ok" : "hot") + '">' + (ok ? "approve" : "на добор") + '</span>'
      + '<span class="text" style="font-family:ui-monospace,monospace;font-size:12px;">'
      + r.branch.split("/").slice(-2).join("/") + '</span></div>';
  }).join("");

  document.getElementById("runs").innerHTML = DATA.runs.map((r) =>
    '<div class="row"><span class="text" style="font-family:ui-monospace,monospace;font-size:12.5px;">'
    + r + '</span></div>').join("");

  document.getElementById("deploy").innerHTML = DATA.deploy.contracts.concat([DATA.deploy.wallet]).map((c) =>
    '<div class="row"><span class="id" style="min-width:190px;">' + c.name + '</span>'
    + '<span class="addr"><a href="https://sepolia.basescan.org/address/' + c.address + '" target="_blank" rel="noreferrer">'
    + c.address.slice(0, 10) + "…" + c.address.slice(-6) + '</a></span></div>').join("");
}

render();

async function postJSON(url, body, btn) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok || j.ok === false) throw new Error(j.error || "не вышло");
    if (j.data) applyData(j.data);
    return j;
  } catch (err) {
    const msg = (err.message || "не вышло").slice(0, 42);
    if (btn) {
      btn.textContent = msg;
      setTimeout(() => render(), 2600);
    } else {
      document.getElementById("sync").textContent = "не вышло: " + msg;
    }
  }
}

document.getElementById("kanban").addEventListener("click", (e) => {
  const judgeBtn = e.target.closest("button.mini.judge");
  const btn = judgeBtn || e.target.closest("button.mini");
  if (!btn || btn.disabled) return;
  const t = DATA.queue.find((x) => x.id === btn.dataset.id);
  if (!t) return;
  btn.disabled = true;
  btn.textContent = "…";
  if (judgeBtn) postJSON("/api/judge-run", { id: t.id }, btn);
  else postJSON("/api/ticket-toggle",
    { change: t.change, section: t.section, text: t.text, done: !t.done }, btn);
});

const kanbanEl = document.getElementById("kanban");
kanbanEl.addEventListener("dragstart", (e) => {
  const card = e.target.closest(".kcard");
  if (!card || !card.draggable) return;
  dragId = card.dataset.id;
  card.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  try { e.dataTransfer.setData("text/plain", dragId); } catch {}
});
kanbanEl.addEventListener("dragend", () => {
  kanbanEl.querySelectorAll(".kcol.over").forEach((c) => c.classList.remove("over"));
  const card = kanbanEl.querySelector(".kcard.dragging");
  if (card) card.classList.remove("dragging");
  dragId = null;
  render();
});
kanbanEl.addEventListener("dragover", (e) => {
  if (!dragId) return;
  const col = e.target.closest(".kcol");
  if (!col) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (!col.classList.contains("over")) {
    kanbanEl.querySelectorAll(".kcol.over").forEach((c) => c.classList.remove("over"));
    col.classList.add("over");
  }
});
kanbanEl.addEventListener("drop", (e) => {
  if (!dragId) return;
  const col = e.target.closest(".kcol");
  if (!col) return;
  e.preventDefault();
  const t = DATA.queue.find((x) => x.id === dragId);
  const target = col.dataset.col;
  dragId = null;
  if (!t) return;
  if (target === "done") {
    if (t.done) return;
    postJSON("/api/ticket-toggle",
      { change: t.change, section: t.section, text: t.text, done: true });
  } else if (target === "next" || target === "queue") {
    if ((t.state || "").startsWith("claimed")) return;
    postJSON("/api/ticket-move",
      { change: t.change, section: t.section, text: t.text, place: target });
  } else if (target === "work") {
    if (t.done || (t.state || "").startsWith("claimed")) return;
    postJSON("/api/ticket-claim", { id: t.id });
  }
});

async function poll() {
  try {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (!r.ok) return;
    const fresh = await r.json();
    const stamp = "живой режим: обновлено в " + new Date().toLocaleTimeString("ru-RU");
    if (KEY(fresh) !== lastKey) applyData(fresh);
    document.getElementById("sync").textContent = stamp;
  } catch {
    document.getElementById("sync").textContent = "офлайн-режим: пересобери node dashboard/build.mjs";
  }
}

setInterval(poll, 4000);
poll();
</script>
</body>
</html>
`;
}
