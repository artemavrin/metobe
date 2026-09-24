# S3 + S7. OpenAI-совместимые источники: Яндекс и Ollama

Проверено 2026-09-24: `ai@7.0.113`, `@ai-sdk/openai-compatible@3.0.55`, Node 24. Один скрипт на оба spike: вопрос один — стримит ли источник, вызывает ли инструменты в обычном и стрим-режиме, замыкает ли цикл «вызов → результат → ответ».

```sh
pnpm install --ignore-workspace
# Яндекс: ключ и каталог в .env (в git не попадает)
set -a && . ./.env && set +a
BASE_URL=https://ai.api.cloud.yandex.net/v1 API_KEY=$YANDEX_API_KEY FIX=yandex NAME=yandex \
  MODEL="gpt://$YANDEX_FOLDER_ID/aliceai-llm/latest" pnpm spike
# Ollama
BASE_URL=http://<host>:11434/v1 NAME=ollama MODEL=gemma4:e4b pnpm spike
```

## Результат

Все пять проверок (`text`, `stream text`, `tool call`, `stream + tool call`, `tool loop (stream)`) зелёные:

- **Яндекс** (`llm.api` и `ai.api`): Alice AI, YandexGPT 5.1 / 5 Pro / 5 Lite, Qwen3 235B, gpt-oss-120b, DeepSeek V4 Flash. Alice AI — только с `yandexFetch` (ниже).
- **Ollama** (сервер в сети): `qwen3:0.6b`, `gemma4:e4b`, `gpt-oss-20b-32k`.

## Ответы

**S3, Яндекс.**
1. **Авторизация:** API-ключ проходит и как `Authorization: Bearer <key>` (так его шлёт `createOpenAICompatible` по умолчанию), и как `Api-Key <key>`. Свой заголовок не нужен.
2. **`OpenAI-Project` не нужен.** Модель адресуется полным URI с каталогом — `gpt://<folder>/<model>/latest`; короткие id (`yandexgpt-5.1`, `yandexgpt-5.1/latest`) дают `400 Failed to parse model URI` даже с заголовком.
3. **Discovery есть:** `GET /v1/models` отдаёт готовые URI всех моделей каталога — чат (`gpt://`), эмбеддинги (`emb://`), голос (`speech-realtime-*`). Для чата берём `gpt://`, кроме `speech-*`.
4. **`tool_choice: required` работает** у всех семи моделей (раньше в ARCH было «только auto и none»).
5. **Стрим настоящий, но у YandexGPT крупными кусками** — примерно по предложению (5–6 кусков на 1100 символов, первый через 0,5–0,8 с). У Alice AI, Qwen, gpt-oss — мелкими. В UI сглаживать (`smoothStream`).
6. **Аргументы инструментов:** у Qwen и gpt-oss приходят по частям (8–10 дельт), у Alice AI, YandexGPT и DeepSeek — одним куском.
7. **Alice AI ломает поток с инструментами** — обходится на нашей стороне обёрткой `fetch` (`yandex-fetch.ts`, ~40 строк), на остальных моделях она ничего не меняет:
   - при `tool_choice: auto` нет куска с `finish_reason` → AI SDK падает «stream ended without a finish reason». Добавляем `finish_reason: "tool_calls"` перед `[DONE]`, если был вызов;
   - при `required` в текст утекает служебный `[TOOL_CALL_END]` → вырезаем;
   - `id` вызова равен имени функции (`"weather"`) → делаем уникальным, иначе параллельные вызовы одного инструмента спутаются.

**S7, Ollama.**
1. **Хватает `@ai-sdk/openai-compatible` на `/v1`**, `ai-sdk-ollama` не нужен: стрим, инструменты в обоих режимах и цикл работают у всех трёх моделей.
2. Аргументы инструмента приходят одним куском.
3. Первый запрос к модели — 8–14 с: сервер загружает её в память. Статус генерации должен это подписывать (P9).
4. Самая маленькая модель (`qwen3:0.6b`) в финальном ответе исказила результат инструмента («снег» вместо дождя) — это качество модели, не API; для инструментов подсказывать модели покрупнее.
