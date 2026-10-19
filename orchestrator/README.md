# Оркестратор

Очередь тикетов собирается из `openspec/changes/*/tasks.md` (чекбоксы).
Скрипт — тонкий слой: очередь, ветки, worktrees. Запуск агентов — снаружи,
через CLI-агента (opencode / Claude Code / Codex).

## Команды

```bash
node orchestrator/index.mjs list                    # очередь тикетов
node orchestrator/index.mjs claim --ticket 001-tc-04
node orchestrator/index.mjs board                   # занятость (ветки/worktrees)
node orchestrator/index.mjs snapshot                # JSON для дашборда
```

`claim` создаёт git worktree `worktrees/001-tc-04` и ветку
`work/001/tc-04` (или переиспользует существующие) — параллельные агенты
не мешают друг другу.

## Запуск агентов (loop)

Пример для opencode — по одному агенту на worktree:

```bash
WT=$(git worktree list --porcelain | grep worktrees/001-tc-04 ...)
cd "$WT" && opencode run "Тикет 001-tc-04 из tasks.md. Читай AGENTS.md: план → код → тест → self-review диффа → коммит (001-tc-04) → отчёт."
```

Такой же паттерн для Claude Code (`claude -p`), Codex (`codex exec`).
Ночную серию запускает обёртка: очередь → свободный worktree → agent cmd
→ overlay логов в `docs/runs/YYYY-MM-DD-<ticket>.md`.

## Метрики (для dashboards/)

- закрываемость тикетов (queue.ready vs done из tasks.md)
- first-pass yield: доля тикетов, прошедших judge без request-changes
  (лог judge: `judge/results/*.md`)
- `$ на тикет` из журналов провайдера
