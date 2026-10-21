# Прогон 2026-10-21 — живой деплой на Base Sepolia + золотой путь сцены

Интеграционный прогон (вне тикетов, продолжение добора tc-13): первые
реальные транзакции «Пухляндии» в демо-сети. Все шаги выполнены агентом
Qoder; пользователь сделал один ручной шаг — кран.

## Финансирование без денег (краны с майнет-фильтром не сработали)

- Alchemy faucet требует ≥0.001 ETH на Ethereum mainnet (анти-сибил);
  QuickNode и Chainstack — то же самое. Для пустого burner-кошелька все
  три закрыты.
- Рабочий путь: **Google Cloud Web3 faucet** (вход через Google-аккаунт,
  майнет-баланс НЕ нужен, ~0.05 Sepolia ETH/день) → пользователь получил
  0.05 Sepolia ETH на `0xae887A5712132C7cC1f62127AB1A1f8f03A91413`
  (tx `0x5a9f2ea5…54aad`).
- Мост Sepolia → Base Sepolia прогнан агентом через cast без MetaMask:
  `cast send 0xfd0Bf71F60660E2f608ed56e1659C450eB113120 "bridgeETH(uint32,bytes)" 100000 0x --value 0.03ether`
  — официальный L1StandardBridge Base Sepolia (адрес сверен по докам
  docs.base.org и живым tx на etherscan). L1 tx `0x2f5b82b5…5c8e`,
  статус 1. Задержка зачисления L2 ~15 минут — норма для моста.
  На Sepolia осталось 0.02 ETH на газ.

## Деплой (forge script Deploy.s.sol, chain 84532)

`ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`, ~0.0001 ETH газа:

- TokenBoundAccount impl: `0x5FbD…` (см. broadcast/84532/run-latest.json)
- Registry: `0x5d8Cdad3D38E7921720F74018B7eBfbf788aFDcb`
- Critter: `0xf9cC9371d6392de66Cb1BA4Caef1e90F9d3A6b1A`
- TBA кошелёк пухлика: `0xf44B34bf267fD2735fD31F3F1A9a100d57a0A596`
- Achievements: `0x8Af3ef94e6D2881e1ADFDE6c7eb0b4fEA416D2CB`
- tokenId 1, владелец = burner-деплоер.

Проверка он-чейн: `ownerOf(1)` = burner; `critter(1)` = dnaSeed, stage 0,
level 0, сытость 80; `tokenURI(1)` = `data:image/svg+xml;base64,…` — арт
живёт прямо в контракте.

## Золотой путь сцены (браузер, dev-сервер :5199)

Адреса проведены в `packages/web/.env` (VITE_CRITTER/REGISTRY/
ACHIEVEMENTS_ADDRESS). Сцена: пухлик отрисован **он-чейн SVG из ДНК**
(не заглушка), карточка TbaCard показывает настоящий TBA-адрес
`0xf44B…A596` с basescan-ссылкой.

Три реальных транзакции ухода из UI (burner-ключ из VITE_DEMO_KEY):

- «Покормить» → сытость 80→100, level 0→1, лента: «Ням-ням! Пухлик поел
  на +20» + basescan-ссылка;
- «Поиграть» → счастье +20, level 2;
- «Уложить спать» → энергия +, level 3.

Он-чейн контроль: `critter(1)` = stage 0, **level 3**, сытость 100,
счастье 90, энергия 90. Лента поймала все три события живьём через
watchContractEvent.

## Попутные доборы (обнаружены живым прогоном)

1. Опечатка в копирайте ленты: «Силки пухлика» → «Силы пухлика»
   (lifeFeed.ts, тест обновлён) — «силки» это ловушки для птиц :)
2. smoke-тест «до деплоя» зависел от пустого `VITE_CRITTER_ADDRESS`
   в локальном .env и упал сразу после реального деплоя. Исправлен:
   `vi.stubEnv` явно (тест не должен зависеть от локального .env).
   `pnpm -r test` — 51/51, `pnpm -r build` — зелёные.

## Что оставлено на живое демо

- Порог эволюции (5-й акт заботы) НЕ закрыт: уровень пухлика 3 из 5.
  На демо два клика эволюционируют пухлика живьём: событие Evolved,
  праздничный баннер ленты, ачивка минтится в TBA-кошелёк, TbaCard
  покажет её с праздничной подсветкой.
- Верификация контрактов на basescan (нужен бесплатный BASESCAN_API_KEY
  пользователя с sepolia.basescan.org — шаг 4 docs/deploy-steps.md).
