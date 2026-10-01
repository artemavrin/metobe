# S6. SeaweedFS как встроенный S3

Проверено 2026-10-02: `chrislusf/seaweedfs:4.48` (релиз 2026-09-28, Apache 2.0), Docker Desktop на macOS (arm64), `@aws-sdk/client-s3` 3.1145.0.

## Стенд

```sh
docker compose up -d   # weed mini: master, volume, filer и S3 в одном процессе
pnpm install --ignore-workspace
node spike.mjs         # 13 проверок
```

Бакет и ключи задаются переменными окружения (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`): `weed mini` сам создаёт бакет при старте. Опасение из D4 «конфиг ключей через JSON» снято — JSON не нужен. Healthcheck — `wget http://127.0.0.1:8333/healthz` (wget в образе есть).

## Результат: 13 из 13

| Проверка | Итог |
| --- | --- |
| SDK: put, head, get, delete | ✓ |
| Неверный секрет | отказ, `SignatureDoesNotMatch` |
| Анонимный GET | 403 |
| CORS бакета: записать и прочитать | ✓, переживает перезапуск |
| Presigned PUT из браузерного origin (preflight + загрузка) | preflight 200, PUT 200, `allow-origin` наш |
| Presigned PUT с чужого origin | preflight 403, CORS не отдан |
| Подменённый ключ в presigned URL | 403 |
| Просроченный presigned URL | 403 |
| Presigned POST в пределах потолка размера | 204 |
| Presigned POST больше потолка (`content-length-range`) | 400 `EntityTooLarge` |
| Presigned PUT с подписанным `Content-Length` и другим размером | 403 |
| Presigned GET с именем для скачивания | 200, `Content-Disposition` наш |
| 50 МБ через SDK | ~250–350 мс на запись |

Данные переживают перезапуск контейнера; здоровым он становится за 6–8 с.

## Подводные камни

- **SDK ломает presigned PUT по умолчанию.** С 2025 года `@aws-sdk/client-s3` кладёт в presigned URL CRC32 *пустого* тела (`requestChecksumCalculation: "WHEN_SUPPORTED"`), и загрузка из браузера с настоящим телом падает с `BadDigest`. Лечится `requestChecksumCalculation: "WHEN_REQUIRED"` у клиента. Это поведение SDK, а не SeaweedFS — касается и внешнего S3.
- **Потолок размера** держат только presigned POST с `content-length-range` или PUT с подписанным `Content-Length`. Голый presigned PUT размер не ограничивает.
- **Admin UI включён по умолчанию и без пароля** (порт 23646 внутри сети compose). Выключаем: `mini -dir=/data -admin.ui=false`.
- **Цена контейнера:** образ ~500 МБ; в покое ~180 МБ памяти (после загрузки 50 МБ — ~380 МБ) и ~8–10 % одного ядра на macOS (фоновые службы `weed mini`). Для маленького VPS заметно; внешний S3 по `S3_*` это снимает.
- **Удалённое место возвращается не сразу:** после удаления 50 МБ на диске осталось ~200 МБ — SeaweedFS освобождает тома фоновым vacuum.

## Вывод для Metobe

SeaweedFS (`weed mini`) подходит как встроенный S3 по умолчанию: один контейнер, ключи и бакет из `.env`, healthcheck, presigned-загрузка с CORS и потолком размера. Решение D4 подтверждено.

Открытый вопрос — как браузер достаёт до S3. Presigned-загрузка требует, чтобы S3 был доступен из браузера (свой порт или путь на том же домене) и CORS на `APP_URL`. Проще для установки одной командой — загрузка и скачивание через приложение (один origin, никакого CORS и второго порта, права проверяет приложение), а presigned оставить для внешнего S3 и больших файлов. Решается при реализации вложений (D33).
