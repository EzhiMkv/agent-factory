# Деплой «Пухляндии» на Base Sepolia (тикер 003-tc-13)

Пошаговая процедура: кран → сухой прогон на anvil → деплой на Base
Sepolia → верификация на basescan → проводка адреса в web. Все шаги
проверяемы другим человеком по порядку. Единственный источник секретов
— корневой `.env` (шаблон `.env.example`); в коде и командах ниже нет
ни одного ключа. Ничего из этого шага не тратит реальные средства:
ключ демо-деплоера — тестовый, средства — крановые.

## 0. Предпосылки

```bash
export PATH="$HOME/.foundry/bin:$PATH"   # если forge не в PATH
forge --version                          # проверено на 1.2.3-stable
```

Заполни корневой `.env` (копия `.env.example`):

```
DEPLOYER_PRIVATE_KEY=      # тестовый ключ демо-деплоера, БЕЗ реальных средств
BASE_SEPOLIA_RPC_URL=      # RPC Base Sepolia (например, endpoint Alchemy)
BASESCAN_API_KEY=          # бесплатный ключ с sepolia.basescan.org (шаг 4)
ANVIL_RPC_URL=             # http://127.0.0.1:8545 (только локально)
```

Команды дальше выполняются из `packages/contracts`. `forge script` сам
читает переменные из `.env` рядом с `foundry.toml` — можно скопировать
корневой `.env` туда локально (файл в git не попадает). Переменные с
`$` в командах ниже (`$BASE_SEPOLIA_RPC_URL`, `$BASESCAN_API_KEY`, …)
подставляет шелл, а не forge: экспортируй их из заполненного `.env`
(из корня репо: `set -a && source .env && set +a`). Ключ при этом
остаётся только в окружении — в историю команд попадает имя переменной.

## 1. Кран: тест-ETH через Alchemy faucet

1. Зарегистрируйся на [`alchemy.com`](https://www.alchemy.com) (бесплатно)
   и создай приложение **Base Sepolia** — получишь endpoint вида
   `https://base-sepolia.g.alchemy.com/v2/…`. Это `BASE_SEPOLIA_RPC_URL`.
2. Открой [faucet Base Sepolia](https://www.alchemy.com/faucets/base-sepolia).
3. Вставь адрес демо-деплоера (адрес публичный для ключа из `.env`;
   после `set -a && source .env && set +a` из шага 0:
   `cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY"` —
   в историю команд попадает только имя переменной, не ключ).
4. Реши капчу и запроси средства. Faucet даёт тестовый ETH (достаточно
   ~0.01 ETH на всю демо-сцену).
5. Проверь баланс:
   `cast balance <АДРЕС> --rpc-url $BASE_SEPOLIA_RPC_URL` — должно быть > 0.
   Если пусто — faucet иногда подкапризничает: попробуй позже или с
   другого браузера.

## 2. Сухой прогон деплоя на anvil (критерий тикета)

Anvil запускается в отдельном терминале:

```bash
anvil --port 8545
```

Прогрей несколько блоков — ДНК пухлика считается через
`blockhash(block.number - 1)`, а на голом anvil высота сети 0, и прогон
падает с `panic 0x11` (arithmetic underflow). Одного майна достаточно:

```bash
cast rpc anvil_mine 3 0 --rpc-url $ANVIL_RPC_URL
```

Сухой прогон — broadcast уходит ТОЛЬКО в локальную сеть:

```bash
forge script script/Deploy.s.sol --rpc-url $ANVIL_RPC_URL --broadcast
```

Ожидаемый хвост вывода (свежая сеть, деплоер с нулевым nonce):

```
=== Puhlyandiya deploy ===
deployer:              0xf39F…
TokenBoundAccount impl: 0x5FbD…
Registry:               0xe7f1…
Critter:                0x9fE4…
minted tokenId:         1 (owner: 0xf39F…)
VITE_CRITTER_ADDRESS=0x9fE4…
…
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
```

Проверено в этом репо (forge 1.2.3-stable): 4 транзакции (impl, registry,
critter, минт), все успешны, пухлик вылупляется у деплоера. Контроль
после прогона:

```bash
cast call 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0 \
  "ownerOf(uint256)(address)" 1 --rpc-url $ANVIL_RPC_URL
# → 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (адрес демо-деплоера)
```

Адреса контрактов выводятся из nonce деплоера: на уже погонявшей сети
они сдвинутся — сверяй не точные значения, а форму вывода и строку
`ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`. Broadcast-логи прогона
остаются локальными и в git не попадают.

## 3. Реальный деплой на Base Sepolia (chain 84532)

```bash
ETHERSCAN_API_KEY=$BASESCAN_API_KEY forge script script/Deploy.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --verify
```

- Порядок деплоя внутри скрипта важен: `TokenBoundAccount (impl)` →
  `Registry` → `Critter` → `mintTo(deployer)` — сначала impl и registry,
  чтобы TBA-кошелёк мог быть создан от них.
- Ключ верификатора forge читает из переменной `ETHERSCAN_API_KEY`
  (см. `forge script --help`; проверено на 1.2.3-stable), поэтому
  хранимый в `.env` `BASESCAN_API_KEY` пробрасывается в команду.
- Скрипт печатает `VITE_CRITTER_ADDRESS=…` — сохрани адрес (шаг 5).
  Черновик адресов прогона лежит в
  `broadcast/Deploy.s.sol/84532/run-latest.json` после запуска
  (в git не попадает — broadcast-логи заигнорены).
- Если пропустил `--verify` — верифицируй отдельно (шаг 4).

## 4. Верификация на basescan

Возьми бесплатный API-ключ на [sepolia.basescan.org](https://sepolia.basescan.org).
basescan живёт по Etherscan-API, поэтому у forge флаг-ключ называется
`--etherscan-api-key`. У всех трёх контрактов конструкторы без аргументов.

```bash
forge verify-contract <АДРЕС_TBA_IMPL> src/erc6551/TokenBoundAccount.sol:TokenBoundAccount \
  --chain-id 84532 --verifier etherscan \
  --verifier-url https://api-sepolia.basescan.org/api \
  --etherscan-api-key $BASESCAN_API_KEY

forge verify-contract <АДРЕС_REGISTRY> src/erc6551/Registry.sol:Registry \
  --chain-id 84532 --verifier etherscan \
  --verifier-url https://api-sepolia.basescan.org/api \
  --etherscan-api-key $BASESCAN_API_KEY

forge verify-contract <АДРЕС_CRITTER> src/Critter.sol:Critter \
  --chain-id 84532 --verifier etherscan \
  --verifier-url https://api-sepolia.basescan.org/api \
  --etherscan-api-key $BASESCAN_API_KEY
```

Ожидаемо: `Contract successfully verified`. На
`https://sepolia.basescan.org/address/<АДРЕС>#code` появляется вкладка
Contract + Read. Проверка деплоя:

```bash
cast call <АДРЕС_CRITTER> "ownerOf(uint256)(address)" 1 --rpc-url $BASE_SEPOLIA_RPC_URL
# → адрес демо-деплоера
```

## 5. Проводка адреса в web

В `packages/web/.env` (свой локальный, в git не попадает) заполни:

```
VITE_CRITTER_ADDRESS=0x…   # адрес Critter из логов шага 3
```

После этого 30-секундная сцена работает по адресу демо-деплоера в Base
Sepolia: пухлик рисуется on-chain SVG из ДНК, кнопки уходят `sendCare`'ом
в сеть.
