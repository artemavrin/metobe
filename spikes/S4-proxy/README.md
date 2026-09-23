# S4. Прокси и AI Gateway

Проверено 2026-09-23: `ai@7.0.112`, `@ai-sdk/openai@4.0.73`, `@ai-sdk/anthropic@4.0.61`, `@ai-sdk/openai-compatible@3.0.54`, `@ai-sdk/gateway@4.0.90`, `undici@8.11.0`, `socks@2.8.10`, `nodemailer@10.0.10`, Node 24.

## Стенд

`compose.yml`: HTTP- и SOCKS5-прокси (3proxy, с логином), мок OpenAI/Anthropic и Mailpit. Мок и SMTP Mailpit сидят во внутренней сети, с хоста напрямую недоступны (`curl http://mock:8080` → нет ответа). Если ответ пришёл, значит, он прошёл через прокси. Логи прокси показывают, куда открывался туннель.

```sh
docker compose up -d --wait
pnpm install --ignore-workspace
pnpm spike
docker compose down
```

## Результат

```
openai-compatible + tool direct            ok   "[mock] hello from openai" tools=weather({"city":"Moscow"})
anthropic via SOCKS5 (socks5h)             ok   "[behind-proxy] hello from anthropic"
openai.chat + tool via HTTP proxy          ok   "[behind-proxy] hello from openai" tools=weather({"city":"Moscow"})
https api.anthropic.com via SOCKS5         ok   HTTP 401
https api.openai.com via HTTP proxy        ok   HTTP 401
pinned SOCKS5 https example.com            ok   HTTP 200
pinned HTTP CONNECT https example.com      ok   HTTP 200
pinned SOCKS5 blocks localhost             ok   Error: blocked address ::1 for localhost
pinned HTTP blocks 10.0.0.1                ok   Error: blocked address 10.0.0.1 for 10.0.0.1
SMTP via SOCKS5                            ok   250 2.0.0 Ok: queued as …
SMTP via HTTP CONNECT                      ok   250 2.0.0 Ok: queued as …
```

## Ответы

1. **`fetch` есть у всех четырёх провайдеров**, включая `@ai-sdk/anthropic`. Три провайдера с тремя маршрутами (HTTP-прокси, SOCKS5, напрямую) работают одновременно в одном процессе, стрим и тулы проходят.
2. **Маршрут — это undici-dispatcher**, провайдер получает `fetch = (url, init) => undici.fetch(url, { ...init, dispatcher })`. Брать `fetch` из пакета `undici`, а не глобальный: dispatcher из npm-undici и встроенный в Node fetch — разные версии.
   - HTTP/HTTPS — `ProxyAgent`, логин и пароль берёт из URL сам. `http://` цели он тоже туннелирует через `CONNECT`.
   - «Напрямую» — явный `new Agent()`. Иначе на Node 24 с `NODE_USE_ENV_PROXY` глобальный fetch подхватит `HTTPS_PROXY` из окружения.
3. **SOCKS5 — свой коннектор на `socks` + `undici.buildConnector` (~20 строк), без `fetch-socks`.** `fetch-socks` — те же 40 строк, но тянет свой `undici@7` рядом с нашим 8: два мажора undici в процессе нам ни к чему. Имя цели уходит в прокси — это поведение `socks5h`. Для `socks5` резолвим сами — это тот же путь, что и закреплённый IP.
4. **Закреплённый IP (SSRF-трафик) — работает и для HTTP CONNECT, и для SOCKS5.** Свой коннектор для `Agent`: `dns.lookup` → проверка адреса → туннель на IP (`Client.connect` у HTTP-прокси, `SocksClient` у SOCKS) → TLS поверх сокета через `buildConnector`. SNI и проверка сертификата — по имени, `Host` — по имени, потому что URL не меняется. В логах прокси виден IP, а не имя. Приватные адреса отсекаются до первого байта наружу.
5. **SMTP через прокси — nodemailer умеет оба:** `proxy: "socks5://…"` (нужен `transport.set("proxy_socks_module", socks)`) и `proxy: "http://…"` через `CONNECT`. Имя SMTP-хоста уходит в прокси. Для своих подключений пользователей (SSRF-правило) нужно закрепление: `host: <проверенный IP>` + `tls.servername: <имя>` или хук `getSocket` с нашим коннектором — **не проверено**, Mailpit без TLS. Сделать в M4 вместе с коннектором `smtp`.
6. **AI Gateway discovery: `/v1/models` публичный** — без ключа, 388 моделей. У каждой модели есть:
   - возможности (`tags`: `tool-use`, `vision`, `reasoning`, `structured-output`, `file-input`, `web-search`, `explicit-caching`…);
   - контекст и лимит вывода (`context_window`, `max_tokens`);
   - `type` (`language`, `embedding`, `image`, …), `modalities`, `supported_parameters`, `reasoning_options`, `knowledge`;
   - цены USD за токен **с тирами** по длине контекста: `input_tiers`, `output_tiers`, кеш чтения и записи.

   `/v1/models/{id}/endpoints` отдаёт то же по каждому апстрим-провайдеру: маршрутизация и цены у конкретного вендора. Для возможностей он **не нужен**.
7. **Фактическая стоимость Gateway:**
   - `generationId` приходит в `providerMetadata.gateway.generationId`;
   - `gateway.getGenerationInfo({ id })` отдаёт `totalCost`, токены, провайдера, латентность;
   - записи появляются асинхронно, поэтому до готовности API отвечает 404 и нужен повтор. Это задача для worker: сначала пишем оценку по прайсу, потом уточняем.

   Проверено по типам пакета и докам Vercel, вживую — **нет** (нужен ключ).

## Что поменять

- ARCH §7.2: «проверить» у anthropic снять.
- ARCH §7.5: discovery из публичного `/v1/models` (возможности есть), `/endpoints` не нужен; стоимость — `generationId` + фоновое уточнение.
- ARCH §18.4: SOCKS и закрепление — свои коннекторы, `fetch-socks` не берём; SMTP через прокси штатно.
- D19: тиры цен (дороже после 200K контекста). В v1 храним базовую ставку в `models.price_*`, у Gateway стоимость уточняется фактической, тиры — v2.
