# Spec delta: клиент T-Invest

## ADDED Requirements

### Requirement: Список акций TQBR
Клиент отдаёт список акций Мосбиржи (class_code TQBR) с полями:
`ticker`, `name`, `instrumentUid` (uuid), `currency`.

#### Scenario: фильтрация не-TQBR
- **WHEN** в выдаче есть инструменты с другими class-codes
- **THEN** клиент возвращает только TQBR и не собирает лишние поля

### Requirement: свечи
`getCandles(uid, interval, from, to)` отдаёт OHLCV-массив по возрастанию ts;
внутренняя пагинация прозрачна для вызывающего (лимит страниц API — наш вопрос).

#### Scenario: несколько страниц
- **GIVEN** период больше одной страницы выдачи
- **WHEN** вызывается getCandles
- **THEN** все страницы склеены, сортировка по ts возрастающая, дубликатов нет

#### Scenario: пустой период
- **WHEN** API не отдал ни одной свечи
- **THEN** возвращается пустой массив (без паники и без ретраев)

### Requirement: новости по инструменту
`getNews(uid, from, to)` → список `{id, title, body, url, ts, instrumentUids}`.

#### Scenario: привязка инструментов сохраняется
- **WHEN** новость относится к двум instrument_uid
- **THEN** `instrumentUids` содержит оба, порядок соответствует API
- **И** получение новостей не требует LLM-привязки (это заложено в API)

### Requirement: ошибки и ретраи
Авторизация 40x → `TInvestAuthError`; throttle-ошибки → ретрай c exponential
backoff (макс 3), далее `TInvestRateError`; сеть/транспорт → `TInvestTransportError`.

#### Scenario: нет токена
- **GIVEN** `T_INVEST_TOKEN` пуст
- **THEN** клиент создаётся, но любой вызов бросает `TInvestAuthError`
  с понятным текстом где посмотреть .env.example

### Requirement: throttling
Исходящие gRPC-запросы ограничены токен-бакетом (по умолчанию 5 rps,
конфигурируемо), чтобы не упираться в лимиты чтения API.

#### Scenario: burst запросов
- **WHEN** 20 параллельных getCandles
- **THEN** клиент не шлёт более 5 в секунду, все ответы доходят
