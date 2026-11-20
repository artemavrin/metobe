# S11. Песочница на Docker: runc и gVisor

Проверено 2026-11-20 на arm64: Docker Desktop 29.8 (runc, macOS) и Colima (Ubuntu 24.04, Docker 29.5) с gVisor `release-20261116.0` (`runsc`). Образ `python:3.13-slim`, клиент — `dockerode` 5.0.1 по unix-сокету.

## Стенд

```sh
pnpm install --ignore-workspace
DOCKER_SOCKET=$HOME/.docker/run/docker.sock RUNTIME=runc node spike.mjs        # Docker Desktop
DOCKER_SOCKET=$HOME/.colima/s11/docker.sock RUNTIME=runsc node spike.mjs       # Colima с gVisor
ULIMIT_KB=400000 …                                                             # потолок памяти на процесс
```

gVisor в Colima: `colima start s11 --runtime docker --vm-type vz`, затем в VM `runsc` из apt-репозитория gVisor и `runsc install` (прямые ссылки `releases/release/latest/<arch>/runsc` отдают 404). **`colima start` делает свой контекст текущим** — сразу вернуть `docker context use desktop-linux`, иначе дев пойдёт не в тот Docker.

Контейнер: `--read-only`, `--cap-drop ALL`, `no-new-privileges`, `--network none`, `--user 1000:1000`, память 512 МБ без swap, 1 ядро, 128 процессов, tmpfs `/workspace` 256 МБ и `/tmp` 64 МБ, `--init`, `sleep infinity`; код — `exec`.

## Результат

| Проверка | runc (Desktop) | runc (Colima) | runsc (Colima) |
| --- | --- | --- | --- |
| Создать и запустить | 586 мс | 391 мс | **112 мс** |
| `exec` Python | 55–60 мс | 32 мс | 45 мс |
| Удалить | 364 мс | 39 мс | 5 мс |
| Не root, корень только для чтения, сети нет | ✓ | ✓ | ✓ (ядро `4.19.0-gvisor`) |
| Файлы через archive API (`docker cp`) | ✗ «rootfs is marked read-only» | ✗ | ✗ |
| Файлы tar через stdin/stdout `exec` | ✓ ~50 мс | ✓ | ✓ ~40 мс |
| Срок (`timeout -s KILL`) | ✓ 137 | ✓ 137 | ✓ 137 |
| Память процесса больше потолка | ✓ 137, `oom_kill` в `memory.events`, контейнер жив | ✓ | **✗ падает вся песочница** |
| То же с `ulimit -v` в `exec` | — | — | ✓ `MemoryError`, контейнер жив |
| Форк-бомба | ✓ упирается в pids, контейнер жив | ✓ | ✗ без `ulimit` и с ним: 128 процессов Python съедают 512 МБ, песочница падает |
| Потолок tmpfs | ✓ ENOSPC на 256 МБ | ✓ | ✓ |
| Память простаивающей песочницы | ~0.4 МБ | | ~11 МБ на хосте (5 штук — 54 МБ) |

## Выводы для Ф1

- **Docker + gVisor работает.** Старт под gVisor даже быстрее, простаивающая песочница стоит ~11 МБ — 5 минут ожидания (D47) дёшевы.
- **Файлы только tar через `exec`.** Archive API с read-only корнем не работает ни в одном runtime: подтверждено то, что знала PlusPortal.
- **Под gVisor нехватка памяти убивает всю песочницу**, а не процесс: память считается у всего sandbox. Поэтому: (1) `ulimit -v` у каждого `exec` ниже потолка контейнера — обычная нехватка становится `MemoryError` в коде модели; (2) сервис замечает, что контейнер умер, и говорит модели «песочница перезапущена, кончилась память, файлы этого ответа потеряны», следующий вызов получает новую; (3) потолок процессов ниже (64), чтобы форк-бомба быстрее упиралась.
- **Счётчика OOM под gVisor нет** (`memory.events` недоступен) — «кончилась память» распознаём по `MemoryError`, коду 137 без истёкшего срока и по смерти контейнера.
- **Клиент.** `dockerode` тянет `ssh2`, `cpu-features` и `protobufjs` с нативными сборками — против D34 (образ на alpine без нативного). Нужно немного: create, start, inspect, remove, list по метке, exec с hijack и разбором 8-байтных кадров. Свой клиент на `node:http` по сокету — порядка сотни строк.
- **Хост без gVisor.** По умолчанию держимся D34: `install.sh` включает песочницу только с `runsc`. Для разработки на Mac — `SANDBOX_RUNTIME=runc` явно (Docker Desktop), с предупреждением на экране «Песочница»; gVisor на Mac — через Colima, как здесь.
