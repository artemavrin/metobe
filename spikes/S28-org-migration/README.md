# S28. Миграция живой установки на организации

ARCH §20.4, ORGS-PLAN §12 шаг О1. Проверяли: expand → backfill → contract для `organizations`, `user.organization_id`, `user.org_role` (+ `blocked_at`), `organization_id` в `invitations` (+ `org_role`), `model_runs`, `catalog_items`, `skills` — время на базе размером с живую, блокировки, откат, работа старого кода после expand.

## Как миграции применяются сейчас

- `docker/entrypoint.sh web` → `metobe migrate` → `runMigrations` (`packages/db/src/migrate.ts`): `pg_advisory_lock`, затем `migrate()` из drizzle. Папка — `MIGRATIONS_DIR=/app/migrations` в образе.
- **drizzle (`drizzle-orm@0.45.3`, `pg-core/dialect.js`, `migrate`) применяет все ожидающие миграции одной транзакцией.** Какие ожидают — по `created_at` последней записи в `drizzle.__drizzle_migrations` и `when` из журнала. Следствия: обновление через несколько релизов выполняет expand, backfill и contract атомарно; блокировки `ACCESS EXCLUSIVE` держатся до конца всей пачки; `CREATE INDEX CONCURRENTLY` невозможен.
- Self-hosted обновление (`apps/worker/src/updater.ts`, D35): pull образа → `pg_dump --format=custom` в `/backups` → drain (новые сообщения ждут, ответы до 60 с) → `.env` с новым образом → `docker compose up -d --wait app worker searxng` → проверка `/api/health`. Сбой → старые файлы и, если миграции прошли, `restoreBase` из копии.
- Порядок пересоздания в compose (`compose-order/compose.yml`, Docker Compose v5.5.1 локально; в апдейтере v5.6.1 — там не проверял): **старые `app` и `worker` останавливаются оба, потом стартует новый `app` и мигрирует, новый `worker` — после healthy `app`.** Старый код с миграцией в self-hosted одновременно не работает. Смешанные версии возможны при нескольких `app` (облако, D2) и в окне между релизами expand и contract.

## Профили

Размеры живой установки снимались только агрегатами (read-only, без содержимого) и в репозиторий не пишутся: профиль **live** — малая установка порядка десятка человек за месяц работы, ≈30 МБ.

Профили синтетики (`seed.ts`):

- **live** — малая установка: ≈30 МБ, ≈1,3 тыс. `model_runs`, ≈1 тыс. сообщений по ~18 КБ.
- **year** — **догадка**: те же люди за 12 месяцев, ×12 к строкам: 253 МБ, 16 тыс. `model_runs`, 12 тыс. сообщений.
- **stress** — не живой размер: 200 человек, 1 млн `model_runs`, чтобы увидеть, как растёт время.

Миграции поверх `packages/db/migrations` этого worktree (0000–0069). На `origin/main` уже есть `0070_file_origin` (только `files`), в реальной ветке номера будут 0071+.

## Что в миграциях

`sql/` — рекомендуемый вариант (B), `sql/variant-a/` — простой UPDATE-backfill для сравнения.

1. **`0070_orgs_expand`** — `LOCK TABLE` (порядок ниже), `organizations`, **организация создаётся здесь же** (если в установке есть хоть что-то), `organization_id` во всех пяти таблицах — **с DEFAULT = id этой организации**: существующие строки читают значение из каталога без перезаписи (PG 11+), старый код при вставке получает правильную организацию сам. `org_role`, `blocked_at`, CHECK и FK — `NOT VALID` (без сканирования).
   - Название организации — домен почты суперюзера (**нужно решение**: другого названия в данных нет; владелец переименует).
   - Организационные части `policies` (`access`, `personalConnections`, `personalApprovalDefaults`, `privacy`) копируются в `organizations.settings`, из `policies` не удаляются: старый код читает их там. Удалять — в О3.
   - Пустая неклеймленная установка организацию не получает: её создаёт claim. Claim в О1 должен «создать, если нет».
2. **`0071_orgs_backfill`** — только роли: `superuser→owner`, `admin→admin`, `user→member`; приглашения `admin→admin`, `user→member`. Нет суперюзера — владелец старейший админ, иначе старейший человек (так выглядит база `upgrade-check.sh`: один человек с ролью `user`). Идемпотентно.
3. **`0072_orgs_contract`** — `LOCK TABLE`; догон (организация, если появились первые строки; `organization_id` и `org_role` для строк, которые старый код записал после backfill); `DROP DEFAULT`; `VALIDATE`; `SET NOT NULL`; `unique (organization_id, key)` вместо `unique (key)`; `skills_shared_name` по `(organization_id, name)`; один владелец на организацию (`user_org_owner`); индексы `model_runs (organization_id, created_at)`, `user (organization_id)`, `invitations (organization_id, expires_at)`.
   - Ломает старый код (вставки без `organization_id`/`org_role`), поэтому **отдельным релизом после expand + backfill** и **до появления второй организации** (DEFAULT с id первой организации при двух организациях — утечка).
   - `invitations.role` и `tariff_id` не трогал: `role` можно снять в contract или позже, `tariff_id` — nullable-колонка без backfill на этапе 3.

### Deadlock и `LOCK TABLE`

Первый прогон с писателем `model_runs` упал: миграция взяла `ACCESS EXCLUSIVE` на `user` и ждала `model_runs`, а вставка в `model_runs` держала свою таблицу и ждала `RowShareLock` на `user` для проверки FK. `deadlock.ts`, 10 прогонов, 3 писателя `model_runs` во время миграции (`results/deadlock.json`):

|  | миграция упала | писатели получили deadlock | дольше всего, мс |
| --- | --- | --- | --- |
| без `LOCK TABLE` | 4 из 10 | 19 | 1229 (ждёт `deadlock_timeout`) |
| `LOCK TABLE "model_runs", "invitations", "catalog_items", "skills", "user"` первой командой | 0 из 10 | 0 | 117 |

Порядок: сначала таблицы со ссылкой на `user`, `user` последним — так же, как блокирует писатель. В self-hosted одновременного писателя по compose нет, но `LOCK` ничего не стоит и нужен для облака и окна между релизами.

## Цифры

`measure.ts`, локальный Postgres 18.6 (docker, Apple Silicon). «Миграция» — настоящий `runMigrations`, все три шага ожидают (обновление через оба релиза сразу — худший случай). «Ожидание» — самый долгий запрос двух проб во время миграции: вставка в `model_runs` старой формы и чтение сессии с join на `user` (так Better Auth проверяет вход).

| профиль | база | `pg_dump` апдейтера | миграция | ожидание записи / чтения | повторный запуск | откат SQL | `pg_restore` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| live | ≈30 МБ | 0,7 с (10 МБ) | **0,11 с** | 51 / 51 мс | 29 мс | 38 мс | 1,0 с |
| year (догадка) | 253 МБ | 7,3 с (119 МБ) | **0,20 с** | 134 / 132 мс | 59 мс | 57 мс | 6,6 с |
| stress, 1 млн `model_runs` | 352 МБ | 7,9 с (94 МБ) | **1,04 с** | 999 / 999 мс | 122 мс | 70 мс | 7,9 с |

Вариант A (nullable-колонки и `UPDATE … SET organization_id` в backfill, `results/variant-a/`): live 0,13 с, year 0,37 с, **stress 43,6 с**, из них `UPDATE model_runs` — 45,6 с при пооператорном замере (перезапись каждой строки, три индекса и FK-триггер на каждую строку; без FK — 19,3 с). Вариант B на том же миллионе: `CREATE INDEX model_runs_org_time` 0,64 с, догон в contract (seq scan) 0,15 с, `VALIDATE` FK 0,11 с, `SET NOT NULL` 0,11 с, остальное — миллисекунды.

### Блокировки

До конца транзакции миграции держатся `ACCESS EXCLUSIVE` на `user`, `model_runs`, `invitations`, `catalog_items`, `skills`, `organizations`; `system_settings` — только чтение. Значит, всё, что читает или пишет эти таблицы, ждёт всю миграцию целиком. Любой запрос с сессией читает `user`, поэтому на время миграции встаёт всё приложение — на живом размере это 0,05 с, на годе 0,13 с, на миллионе строк 1 с. В self-hosted приложение в это время и так остановлено: простой обновления определяют `pg_dump` (0,7–7 с), drain (до 60 с) и старт контейнера, а не миграция.

### Совместимость старого кода

- `compat.test.ts` — функции `@metobe/core` этого релиза без изменений: `issueInvitation` + `redeemInvitation` (новый человек), `createCatalogItem` + `listCatalog`, `createSkill` + `skillsForChat`, `recordRun`. **После expand + backfill: 4/4 зелёные**, новые строки получают организацию из DEFAULT. **После contract: 4/4 падают** (`null value in column "organization_id"`): contract — только следующим релизом.
- DB-тесты ядра (`MEMORY_TEST_DATABASE_URL`, 10 файлов: channels, memory-_, model-_, notify) на базе live после expand + backfill: **88/88 зелёные**. После contract: 8 файлов из 10 падают на создании пользователей.
- `edge.ts` — 6/6: новая установка (все миграции на пустой базе, 0 организаций), база `upgrade-check.sh` без суперюзера (человек → owner, организация `example.com`), два админа без суперюзера, строки старого кода между backfill и contract (организация из DEFAULT, роль — догоном в contract), пустая при expand установка с первыми строками до contract, после contract второй владелец и повтор ключа каталога отклонены, тот же ключ в другой организации проходит.

## Откат

1. **Только образ, без базы** — после expand + backfill. Старый код работает на расширенной схеме (проверено выше), данные, записанные после обновления, остаются. После contract так нельзя.
2. **SQL** — `sql/down_contract.sql` (возвращает расширенную схему с DEFAULT, чтобы старый релиз снова работал) и `sql/down_expand.sql` + удаление трёх строк из `drizzle.__drizzle_migrations`. 38–70 мс на всех профилях, схема после отката совпадает с исходной (`pg_dump --schema-only`), повторное применение проходит. Данные не теряются: backfill только копировал. Работает, пока организация одна.
3. **Копия апдейтера** (`restoreBase`) — восстанавливает базу на момент обновления, всё записанное после теряется. 1–8 с на профилях.

**Найдено попутно: `restoreBase` в апдейтере на Postgres 15+ не работает.** Он делает `drop schema public cascade`, а `pg_dump` не пишет `CREATE SCHEMA public` для стандартной схемы `public`. `pg_restore` падает: `schema "public" does not exist`. Воспроизведено на PG 18.6 + pg_dump 18.3 на всех профилях, в том числе когда владелец `public` — `pg_database_owner`, как на живой установке (там проверен только владелец схемы; сам откат на живой не запускал). С `create schema public` после drop восстановление проходит (цифры в таблице). Значит, сейчас неудачное обновление с прошедшими миграциями оставит базу без схемы `public`. Чинить отдельно и до О1, с проверкой отката в CI.

## e2e

Не запускал: нужна сборка образа и продуктовые изменения. Что должно пройти:

- **`upgrade`** (`.github/scripts/upgrade-check.sh`, 0.4.0 → checkout): число миграций сойдётся само (+3 файла). Строка `upgrade-check` сохраняется и становится владельцем (`edge.ts`). Предлагаю дописать проверки: `select count(*) from organizations` = 1, у `upgrade-check` `org_role = 'owner'`.
- **`e2e`** (свежий `install.sh` → claim → `admin.setup.ts`, `onboarding.admin`, `login*`, `locale`): на пустой базе миграции проходят. **Но текущий `redeemClaimToken` после contract упадёт** (вставка без `organization_id`). Без правок e2e это пройдёт, только если О1 вместе с contract меняет claim: создать организацию, суперюзер — `owner`.
- Нужен новый: **обновление N → N+1** (expand + backfill → contract) с записью старым кодом в промежутке, и **откат апдейтера** после неудачной миграции (сейчас сломан, см. выше).

## Критерии готовности (PLAN, S28)

| критерий | итог |
| --- | --- |
| e2e зелёные без правок | **нет — не проверено**: e2e не запускал. Тесты ядра на расширенной базе 88/88, старый код 4/4. Для e2e после contract нужен claim с организацией (продуктовый код О1, сами e2e не меняются) |
| миграция базы размером с живую — меньше минуты | **да**: 0,11 с на live, 0,20 с на годе (догадка), 1,04 с на 1 млн `model_runs` |
| откат описан | **да**: три способа, замерены; найден сломанный `restoreBase` |

Копии живой базы не было по условию: синтетика того же размера и формы. Распределение по таблицам совпадает, содержимое — нет.

## Что поправить в ARCH §20.4 (предложения)

1. «Все три шага — миграции Drizzle…» → дописать: drizzle применяет все ожидающие миграции одной транзакцией. Expand + backfill — релиз N, contract — релиз N+1, не раньше, и до О4/О5 (вторая организация). Обновление через оба релиза выполняет всё атомарно (замерено).
2. Шаг 1: организация создаётся в expand, `organization_id` добавляется с `DEFAULT` = её id. Шаг 2 — только роли. Шаг 3 начинается с догона (то же, что backfill) и снимает DEFAULT. Убирает перезапись `model_runs` (44 с → 1 с на миллионе строк) и делает окно между релизами безопасным для старого кода.
3. Первая команда expand и contract — `LOCK TABLE` таблиц со ссылкой на `user`, `user` последним. Иначе deadlock с писателем `model_runs` (4/10).
4. Правила backfill: нет суперюзера — владелец старейший админ, иначе старейший человек (база `upgrade-check.sh` именно такая). Неклеймленная установка организацию не получает, claim «создаёт, если нет». Название — решить (сейчас домен почты суперюзера).
5. «Проверка на копии живой базы — спайк S28» → «на синтетике размера живой установки (S28)».
6. Добавить про откат: до contract откат — только образ, без базы, данные сохраняются. После contract — `down_contract.sql` или копия апдейтера. Перед О1 починить `restoreBase` (`create schema public`) и добавить в CI проверку отката.
7. `CREATE INDEX CONCURRENTLY` в миграциях недоступен (транзакция drizzle). На живых размерах индексы строятся миллисекунды, на миллионе строк 0,6 с — приемлемо.

## Как запустить

Postgres на `127.0.0.1:5432` (логин из `apps/web/.env`, иначе `SPIKE_PG=postgres://user:pass@host:port`). Работает только с базой `spike_s28`, пересоздаёт её. tsx — из `apps/cli`.

```sh
cd spikes/S28-org-migration
TSX=../../apps/cli/node_modules/.bin/tsx
$TSX measure.ts live            # year | stress; результаты в results/<profile>.json
S28_SQL=sql/variant-a $TSX measure.ts live   # вариант A → results/variant-a/
$TSX deadlock.ts 10             # с LOCK TABLE и без
$TSX edge.ts
cd ../.. && S28_STAGE=2 node_modules/.bin/vitest run --root spikes/S28-org-migration   # 3 — после contract
# DB-тесты ядра на расширенной базе:
apps/cli/node_modules/.bin/tsx spikes/S28-org-migration/stage.ts live 2
cd packages/core && MEMORY_TEST_DATABASE_URL=postgres://purr:purr@127.0.0.1:5432/spike_s28 \
  ../../node_modules/.bin/vitest run channels memory-chat-off memory-digest memory-mail-waits memory-remind \
  memory-reminders model-type memory.test model-title notify
# порядок пересоздания в compose (свой проект spike-s28-compose):
cd spikes/S28-org-migration/compose-order && V=1 docker compose up -d --wait && V=2 docker compose up -d --wait \
  && docker run --rm -v spike-s28-compose_log:/log node:24-alpine cat /log/events; docker compose down --volumes
```
