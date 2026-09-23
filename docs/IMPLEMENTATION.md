# План реализации

Как строим то, что описано в [ARCHITECTURE.md](ARCHITECTURE.md), по этапам из [PLAN.md](PLAN.md). Принцип: **ничего не пишем с нуля, если есть заготовка.** Для каждой заготовки ниже сказано, что берём, что заменяем и почему.

## 1. Заготовки

| Заготовка | Берём | Заменяем / не берём |
| --- | --- | --- |
| Скилл **`scaffold-nextjs`** | `create-next-app` с его флагами, Turborepo, Ultracite (oxlint, oxfmt, lefthook), knip, vitest, `reactCompiler: true`, Agentation в dev | Blode UI → **ReUI + shadcn** (D20); `blode-icons-react` → `lucide-react`, который тянет ReUI (S2); деплой на Vercel → **Docker compose** |
| **shadcn CLI** + реестр **`@reui`** | компоненты интерфейса и графики | EvilCharts — пробовали, отказались (D20) |
| **Better Auth CLI** | генерация Drizzle-схемы auth-таблиц | — |
| **Drizzle Kit** | миграции | — |
| **`vercel/chatbot`** | донор, **не форк**: переносим и адаптируем отдельные файлы (таблица ниже) | NextAuth, гостевые пользователи, Vercel Blob, botid, gateway-only модели, entitlements гостей |
| Пример **Next.js `with-docker`** | Dockerfile на `output: 'standalone'` | — |
| **SearXNG** — официальный Docker-образ | контейнер поиска | свой `settings.yml` с включённым JSON |

**Почему `vercel/chatbot` не форкаем.** Из него пришлось бы вырезать больше, чем взять: авторизацию, гостей, хранилище, botid, привязку к gateway. Проще взять скелет из `scaffold-nextjs` и перенести проверенные куски шаблона:

| Из `vercel/chatbot` | Куда | Что меняется |
| --- | --- | --- |
| `app/(chat)/api/chat/route.ts` | `apps/web/app/api/chat/route.ts` | Better Auth вместо NextAuth, наш реестр моделей, сборка тулов из подключений, `toModelOutput` |
| `lib/db/schema.ts` — Chat, Message_v2, Stream, Vote, Document | `packages/db/schema/chat.ts` | `kind` у чатов (ARCH §5.3); `agent_id` с FK — миграцией v2 вместе с таблицей `agents` |
| `lib/artifacts/*`, `artifacts/<kind>/*` | `apps/web/artifacts/` | `sheet` на ReUI Data Grid (v2) |
| провайдер data-стрима, `use-auto-resume` | `apps/web/modules/chat/` | resume по итогам S1 |
| рендер `message.parts` | `apps/web/modules/chat/components/` | диспетчер по типам, виджеты (§9) |

Версии всех пакетов проверяются при установке по их документации, а не по памяти: для `ai` — `node_modules/ai/docs`.

## 2. Структура монорепо

Turborepo + pnpm workspaces. Пакеты — «just-in-time»: экспортируют TypeScript-исходники без отдельной сборки, Next компилирует их через `transpilePackages`. `worker` и `cli` для Docker-образа бандлятся `tsup`. В `apps/web` нет `src/` — конвенция скаффолда; у Node-приложений `worker` и `cli` код в `src/`, как принято для бандла.

Критерий разбиения: выносим в пакет только то, у чего есть реальная граница — разные потребители, разная среда выполнения (браузер или только сервер), тяжёлые зависимости. Мелкие пакеты «для порядка» не плодим: у каждого свой `tsconfig`, exports и сборка.

### Приложения

| app | Что это | Почему отдельно |
| --- | --- | --- |
| `apps/web` | Next 16: UI, API, генерация чата, SSE уведомлений | — |
| `apps/worker` | Node: BullMQ — email в v1; диспетчер расписаний, запуски агентов, дайджесты — v2 | долгие фоновые задачи не должны тормозить чат (D2) |
| `apps/cli` | `migrate`, `claim-link`, `login-link`, `secrets:rotate`, `seed` | вызывается из entrypoint и `docker compose exec`, без поднятия Next |

Все три собираются в **один Docker-образ** с тремя командами.

### Пакеты

| package | Что внутри | Где выполняется | Кто использует |
| --- | --- | --- | --- |
| `@purr/ui` | дизайн-система: ReUI и shadcn в стиле ReUI, токены и тема, общий CSS, мелкие общие компоненты. **Без бизнес-логики и запросов к данным** | браузер | web |
| `@purr/contracts` | Zod-схемы и типы, общие для клиента и сервера: тело `POST /api/chat`, тип `ChatMessage` (наши data-части и тулы), спеки виджетов, поля коннекторов для форм, DTO API | везде, без Node-зависимостей | web (клиент и сервер), core |
| `@purr/db` | Drizzle: схема по агрегатам, миграции, клиент | сервер | core, cli |
| `@purr/core` | серверный домен, subpath-экспорты: `/secrets`, `/net`, `/ai`, `/chat`, `/mcp`, `/connectors`, `/search`, `/agents`, `/queries`, `/env`. Импортирует `server-only`, ничего из `next/*` | сервер | web (серверная часть), worker, cli |
| `@purr/emails` | react-email шаблоны и `render` | сервер | core |
| `@purr/tsconfig` | общие tsconfig: base, nextjs, node | — | все |

Ultracite, knip и turbo настраиваются в корне, отдельный пакет конфига линтера не нужен.

**Граф зависимостей** — только сверху вниз:

```
apps/web     → @purr/ui, @purr/contracts, @purr/core
apps/worker  → @purr/core
apps/cli     → @purr/core, @purr/db (миграции)
@purr/core   → @purr/db, @purr/contracts, @purr/emails
@purr/ui     → (только react, ReUI, radix/base-ui)
```

Правила, которые держат границы (проверяются knip и ревью):

1. **Приложения не импортируют `@purr/db` напрямую.** Запросы живут в `@purr/core/queries`, иначе web и worker разъедутся в том, как читают одни и те же данные. Исключение — `apps/cli` для миграций.
2. **`@purr/ui` не знает о домене.** Компонент «карточка вызова тула» или «виджет графика» — это домен, его место в `apps/web/modules/*`. В `ui` лежат кнопки, поля, таблица, диалоги, графики как примитивы.
3. **`@purr/contracts` изоморфен.** Никаких `node:*`, драйверов и секретов: его импортирует браузер.
4. **`@purr/core` — только сервер.** Каждый модуль начинается с `import 'server-only'`, чтобы случайный импорт из клиентского компонента падал на сборке, а не утекал в бандл. Этот пакет бросает ошибку вне условия экспорта `react-server`, поэтому `worker` и `cli` запускаются с `--conditions=react-server`, а `tsup` бандлит их с тем же условием — проверено на скелете.

**Чего не выносим и почему:**

- **Рендер чата** (диспетчер parts, карточки тулов, composer, виджеты) остаётся в `apps/web/modules/chat`: потребитель один, а логика завязана на `useChat`. Вынесем, если появится второе приложение.
- **`@purr/ai`, `@purr/mcp`, `@purr/connectors` отдельными пакетами** — не нужны: у них одни и те же потребители (web и worker), дробление добавило бы только конфигов. Границы внутри `core` задают subpath-экспорты. Делим, когда у части появится свой потребитель или тяжёлая зависимость, которая мешает остальным.

**UI в монорепо:**

- Проверено в S2 (D20): `shadcn add` запускается из `packages/ui`, Tailwind видит классы через `@source` в `globals.css` пакета, перезаписей нет.

### Дерево

```
apps/
  web/            app/, modules/{chat,settings,agents,usage,widgets}/, artifacts/ (v2), proxy.ts
  worker/         src/index.ts — регистрация очередей BullMQ
  cli/            src/index.ts — команды
packages/
  ui/             components/{ui,reui,charts}/, styles/globals.css, lib/utils.ts
  contracts/      chat.ts, message.ts, widgets.ts, connectors.ts, api/*
  db/             schema/*, migrations/, client.ts
  core/           secrets/ net/ ai/ chat/ mcp/ connectors/ search/ agents/ queries/ env.ts
  emails/         templates/*
  tsconfig/
docker/           Dockerfile · compose.yml · entrypoint.sh · searxng/settings.yml
scripts/          install.sh
spikes/           S1–S12, вне workspace
docs/
```

## 3. Этап 0 — spikes

Каждый spike — папка `spikes/Sx-name` с `README.md`: вопрос, ответ, что поменять в DECISIONS. Продуктового кода в них нет.

- **Сначала S1, S3, S5** — от них зависит ядро чата.
- **S2 до M1** — от него зависит, чем ставить UI в скелет.
- Остальные — до этапа, которому они нужны (колонка «Решение» в PLAN).

## 4. v1

Каждый этап заканчивается критерием «Готово, когда» из PLAN. Прототип из PLAN делается **до** этапа, к которому он привязан.

### M1. Скелет и установка

1. `scaffold-nextjs`, фазы 1–2 и 4–6: `create-next-app`, Agentation, Ultracite, Turborepo. Фаза 3 (Blode) заменяется на `shadcn init` в стиле ReUI и подключение реестра `@reui` в `components.json`. Фаза 7 (GitHub и Vercel) не выполняется, фаза 8 (favicon, OG) — в M7. Скилл ставит всё через npm, у нас pnpm: команды переводятся на `pnpm`.
2. ✓ Каркас приложений `apps/worker`, `apps/cli` и пакетов `@purr/ui`, `@purr/contracts`, `@purr/db`, `@purr/core`, `@purr/tsconfig` (§2). `@purr/emails` — в M6, вместе с первым письмом: пустой пакет не заводим. Проверено: `server-only` в Node работает с `--conditions=react-server` (tsx в dev, tsup бандлит с тем же условием). `shadcn init` — в монорежиме, примитивы ставятся в `packages/ui`. `turbo.json`: `dev`, `build`, `check-types`, `test`.
3. Drizzle: клиент, `drizzle.config.ts`, схема `system_settings`, `users`, `claim_tokens`, `invitations`. Better Auth CLI генерирует свои таблицы.
4. ✓ Better Auth 1.7 без паролей (D17). Используется **один** плагин — `email-otp`: «магическая ссылка» — это URL `/login/verify?email&code` с тем же кодом, поэтому в письме ссылка и код совпадают, а claim, приглашения и `cli login-link` работают через тот же механизм (`auth.api.createVerificationOTP` выпускает код без отправки письма). Вход — POST из server action: почтовые сканеры, открывающие ссылки, код не сжигают. Публичная регистрация закрыта (`disableSignUp`), код хранится хэшем, 10 минут, 5 попыток. Схема auth-таблиц генерируется официальным CLI `auth` (пакет `auth`, бывший `@better-auth/cli`). Rate limit на запрос кода — в M6 вместе с Redis: server actions вызывают `auth.api` напрямую, минуя HTTP-лимитер Better Auth. Claim-ссылка создаёт сессию суперюзера. `proxy.ts` проверяет только cookie, полная проверка — в layout группы `(app)`. В dev-профиль compose добавляется Mailpit, чтобы письма со ссылками было видно локально.
5. ✓ `docker/Dockerfile`: один образ на Node 24 (web по умолчанию, `worker`, CLI `purr` внутри контейнера), standalone-сборка Next с `outputFileTracingRoot` на корень монорепо, пользователь не root, `pnpm install --ignore-scripts` (корневой `prepare` с lefthook требует git). Compose-файлы: `compose.yml` в корне — установка, только готовый образ, наружу смотрит только приложение; `docker/compose.build.yml` — сборка из исходников; `docker/compose.dev.yml` — порты баз на `127.0.0.1` и Mailpit, подключается через `COMPOSE_FILE` в dev `.env`, поэтому в репозитории хватает просто `docker compose …`. `GET /api/health`. Сборка web не требует env: Better Auth создаётся лениво, а страницы с сессией становятся динамическими.
6. ✓ `entrypoint.sh` → `purr migrate`: мигратор `drizzle-orm` под `pg_advisory_lock` (в standalone-образе нет `drizzle-kit`) → `cli seed` → `cli claim-link`. Если задан `HTTPS_PROXY` / `ALL_PROXY` и прокси ещё нет — запись создаётся на шаге M2, когда появится таблица `proxies`.
7. ✓ **Установщик одной командой:** `curl -fsSL https://github.com/artemavrin/purr/releases/latest/download/install.sh | bash`. Ставит в `./purr` (`PURR_DIR` — другая папка): скачивает `compose.yml` своей версии, задаёт вопросы с умолчаниями (адрес, порт, встроенная или своя БД, прокси, SMTP; при `curl | bash` читает ответы из `/dev/tty`, а docker-команды отрезаны от stdin, иначе съедят остаток скрипта — e2e поэтому запускает установщик через stdin), пишет `.env` с правами 600 и сгенерированными секретами, скачивает образ `ghcr.io/artemavrin/purr:<версия>`, поднимает стек и печатает claim-ссылку. **Повторный запуск той же команды в той же папке — обновление** до последнего релиза, `.env` и секреты не трогаются. Из git-репозитория скрипт ставит этот репозиторий (`PURR_BUILD=1` — собрать образ из исходников, так работает e2e в CI). Неинтерактивно — `PURR_YES=1` и `PURR_*`: префикс нарочно, чтобы глобальный `HTTPS_PROXY` из шелла не утёк в контейнеры.

   **Релизы — release-please** по conventional commits: поддерживает PR «Release vX.Y.Z» с версией и CHANGELOG. `feat`/`fix` дают релиз, `docs`/`chore` — нет. После слияния PR релиз создаётся черновиком с тегом, CI собирает образ под `amd64` и `arm64` на нативных раннерах, публикует теги `X.Y.Z`, `X.Y`, `latest`, прикладывает `install.sh` (с зашитой версией) и `compose.yml` и только потом публикует релиз — `latest` до этого момента указывает на предыдущий. Образ собирается только при релизе; правки одной документации CI не запускают.

8. `/claim` → «Создать аккаунт» → настройки провайдеров: пока нет ни одного провайдера с включённой моделью, чат недоступен и все пути ведут в настройки. Вид — прототип P7.
9. ✓ CI — GitHub Actions (`.github/workflows/ci.yml`): `checks` (линт, типы, сборка) и `e2e` (настоящий `install.sh` в неинтерактивном режиме + Playwright против поднятого стека).

### M2. Провайдеры и модели

1. `@purr/core/secrets`: AES-256-GCM, AAD, canary при старте, `use()`, маски, `purr secrets:rotate`.
2. Схема `providers`, `model_vendors`, `models`, `model_runs`, `secrets`.
3. `@purr/core/net`: прокси, маршрутизация (явный выбор у объекта → домены прокси → напрямую), dispatcher'ы HTTP и SOCKS5 по итогам S4, проверка прокси, автоподбор прокси при недоступном провайдере, закрепление IP для трафика с SSRF-защитой, импорт `HTTPS_PROXY` / `ALL_PROXY` в запись прокси при первом старте. Схема `proxies`, `proxy_domains`, поля `proxy_mode` / `proxy_id` у объектов, UI `/settings/proxies`.
4. `@purr/core/ai`: фабрика по `kind`, `fetch` из `core/net`, Яндекс (итоги S3), кеш и сброс по Redis `config:changed`.
5. Discovery и seed-справочник: Яндекс, цены.
6. UI настроек провайдеров и моделей — прототип P7. Формы на TanStack Form + Zod, данные через TanStack Query.

### M3. Ядро чата

1. Перенос из `vercel/chatbot`: схема чата, `api/chat`, рендер parts — с адаптацией по таблице §1.
2. Стрим, persist, `stop` через реестр `AbortController`, `edit` / `regenerate` (прототип P6), статусы `data-status` (P9).
3. Composer (P2), выбор модели (P3), вложения в S3, заголовок чата, голоса, `model_runs`.
4. Хоткеи: `Esc`, `↑`, `⌘/`.

### M4. Подключения, MCP, поиск

1. Схема `catalog_items`, `connections`, `search_backends`.
2. `@purr/core/mcp`: `@ai-sdk/mcp`, allowlist, префиксы, `approval_policy`.
3. `@purr/core/connectors`: `email` (nodemailer, пресеты, `verify`), `http_api` (авторизация, генерация тулов из OpenAPI), SSRF-guard для своих подключений.
4. `request_connection` + форма в ленте + `POST /api/connections`. Предупреждение о пароле в composer.
5. `web_search` / `web_fetch` на SearXNG, `source-url`-части, карточка источников.
6. UI каталога, «Мои подключения», карточки вызовов тулов и подтверждения — прототипы P4, P8.

### M5. Генеративный UI

1. Реестр виджетов (`chart`, `table`, `metrics`) — схемы в `@purr/contracts`, компоненты в `apps/web/modules/widgets` поверх примитивов `@purr/ui`.
2. `toModelOutput` + `sourceRef` (итоги S5), фолбэк на невалидный спек.
3. ReUI Data Grid и графики по итогам S2.

### M6. Пользователи

Роли, приглашение по ссылке (сама создаёт сессию), SMTP в настройках с тестовым письмом, одноразовая ссылка для входа от админа (в интерфейсе и `purr login-link`), rate limit в Redis.

### M7. Полировка UX

Палитра `⌘K`, пустые состояния, анимации переходов, reduced motion, мобильная вёрстка. Прогон всех экранов по чек-листу из PLAN. Отдельно — скиллы `ui-audit` и `ux-audit`.

## 5. v2 и v3

Детальный план пишется после v1: к тому времени spikes и прототипы поменяют половину допущений. Порядок v2 — из PLAN:

1. фоновые агенты: `apps/worker`, диспетчер, `executeRun`, входящие, уведомления;
2. OAuth MCP;
3. остальное.

## 6. Проверки на каждом этапе

**Смена пресета shadcn** (`apply --preset <код>`) — только из `apps/web`: из `packages/ui` CLI не находит фреймворк. После `apply` вручную:

- вернуть `apps/web/app/layout.tsx`: пресет вписывает шрифт с `subsets: ['latin']`, без кириллицы;
- удалить созданный `apps/web/lib/utils.ts`: `cn()` берётся из `@purr/ui/lib/utils`;
- если сменился стиль (например, `nova` → `mira`), переставить компоненты ReUI из `packages/ui` с `--overwrite`, чтобы они совпали со стилем;
- `pnpm fix`: `globals.css` пишется без форматирования.

- Каждый новый компонент дизайн-системы и каждый виджет сразу появляется на витрине `/dev/showcase` (`pnpm dev` → http://localhost:3000/dev/showcase), чтобы его можно было посмотреть и потрогать руками, а не только на скриншоте.

- `turbo check-types`, `ultracite check`, `vitest` — зелёные, иначе этап не закрыт.
- Критерий «Готово, когда» из PLAN проверяется руками в браузере, на чистой установке через `install.sh`.
- Чистая логика (`@purr/core`, `@purr/contracts`, `modules/*/model`) покрывается тестами рядом с файлом. Компоненты — по необходимости.
