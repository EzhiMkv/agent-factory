# Judge-gate

Модель-судья другого вендора ревьюит дифф тикета до мержа:
промпт — `prompt.md`, вердикт approve / request-changes.

```bash
node judge/index.mjs --branch work/001/tc-04
# ! VERDICT: require-changes → тикет возвращается агенту на добор
# VERDICT: approve → можно мержить в main
```

Конфиг `JUDGE_*` — `.env.example`. Опорное правило: **судья = другой
вендор, не тот, кто кодил** (пример: кодит Claude Code — судит GigaChat;
кодит opencode/GPT — судит Claude). Это ловит систематические промахи
одной модели.

Отчёты судьи: `judge/results/*.md` — из них считается first-pass yield
(доля тикетов, прошедших с первого прогона). Отчёты обязательны: это
доказательство, что gate не фикция.

TODO v2: автокомментарий в PR + запрет мержа без approve.
