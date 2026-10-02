# Changelog

## [0.3.0](https://github.com/artemavrin/metobe/compare/v0.2.0...v0.3.0) (2026-10-02)


### Features

* «connect X to go on» in the chat, and your own mail over SMTP and IMAP ([#46](https://github.com/artemavrin/metobe/issues/46)) ([daeb4f4](https://github.com/artemavrin/metobe/commit/daeb4f4b083f7a8a02235d50f3dde49b0f8b6321))
* «Подключения» — each user's own MCP credentials; OAuth in the provider's window ([#33](https://github.com/artemavrin/metobe/issues/33)) ([8203c78](https://github.com/artemavrin/metobe/commit/8203c781b4e2f095175c841d4144c85ec319a3a4))
* a reloaded page rejoins the answer, history is trimmed to fit, tables group, and the agent has a clock ([#52](https://github.com/artemavrin/metobe/issues/52)) ([ea34c9f](https://github.com/artemavrin/metobe/commit/ea34c9fc6d4b98875c514a1742d1950d6f94e943))
* an MCP server's optional description tells the model what the service is for ([#39](https://github.com/artemavrin/metobe/issues/39)) ([4377eb3](https://github.com/artemavrin/metobe/commit/4377eb314526f553cd31d66bbb8453578ea81963))
* attachments — files in the composer, read by the model through a tool, described by a Vision model ([#57](https://github.com/artemavrin/metobe/issues/57)) ([d8482bf](https://github.com/artemavrin/metobe/commit/d8482bf97a8023c41ddd1d0f58b92ce2890d6088))
* charts in answers — the model streams points into bars, lines, areas and pies ([#34](https://github.com/artemavrin/metobe/issues/34)) ([252f49c](https://github.com/artemavrin/metobe/commit/252f49cde9b117de2e5ef7ad4e1871a35d430248))
* charts on evilcharts (ECharts) in a new palette, with every kind the model may want ([#47](https://github.com/artemavrin/metobe/issues/47)) ([c0d09f8](https://github.com/artemavrin/metobe/commit/c0d09f88376bd45fa898ab654af89d9caea6cfe8))
* chat core — schema, POST /api/chat (M3.1) ([#23](https://github.com/artemavrin/metobe/issues/23)) ([ee557c3](https://github.com/artemavrin/metobe/commit/ee557c3c2b1fd58ad2004609a2f0a742a01e941e))
* chat screen — shell, thread, composer «Щелчок» (M3) ([#26](https://github.com/artemavrin/metobe/issues/26)) ([3849a50](https://github.com/artemavrin/metobe/commit/3849a502113ff70eb3db8b2cc03b9af485d09246))
* chat thread — toolbars, honest status, reasoning, config:changed ([#29](https://github.com/artemavrin/metobe/issues/29)) ([77928c1](https://github.com/artemavrin/metobe/commit/77928c15b8bfe25dd30b12581e49eb6d75570d2d))
* encrypted secrets store with a key canary and rotation ([#9](https://github.com/artemavrin/metobe/issues/9)) ([2d70863](https://github.com/artemavrin/metobe/commit/2d708637e75df8c8195dab2f01a8739cede57b3b))
* file storage — the bundled SeaweedFS or your own S3, chosen at install ([#56](https://github.com/artemavrin/metobe/issues/56)) ([b99c86c](https://github.com/artemavrin/metobe/commit/b99c86c8e6c4eebdb01a25ff3c31c6abfaa5d5ab))
* language and region per user — next-intl with cookies, no locale in URLs ([#6](https://github.com/artemavrin/metobe/issues/6)) ([b6ab4a2](https://github.com/artemavrin/metobe/commit/b6ab4a2cf4c817f5957ec5e28878d0f8cd2e83d3))
* MCP servers — catalog, @ mentions in the chat, sign in from the chat, work block ([#30](https://github.com/artemavrin/metobe/issues/30)) ([af7c383](https://github.com/artemavrin/metobe/commit/af7c383141a0550b499611ec26d24cdbbbd3f0ad))
* model discovery from the sources themselves, exact prices per any unit ([#13](https://github.com/artemavrin/metobe/issues/13)) ([dbf1585](https://github.com/artemavrin/metobe/commit/dbf15851e74e3a52322a67c89c241ebddb18e46e))
* model picker — favorites, palette ⌘/, model peek (M3, P3) ([#27](https://github.com/artemavrin/metobe/issues/27)) ([1d280e4](https://github.com/artemavrin/metobe/commit/1d280e4b5e10849de068989bd9569ef71f9a2451))
* onboarding — source, key, models, «Metobe готов» (M2 6d) ([#21](https://github.com/artemavrin/metobe/issues/21)) ([224032b](https://github.com/artemavrin/metobe/commit/224032b78c82acc5bee25d6d02fcedef31446c13))
* one account screen, an account menu in the sidebar, and the profile behind them ([#48](https://github.com/artemavrin/metobe/issues/48)) ([c78df8e](https://github.com/artemavrin/metobe/commit/c78df8ee91d34316557fe1cf82311de1fc4f361c))
* outgoing network with proxies (routes, HTTP/SOCKS5, checks) ([#11](https://github.com/artemavrin/metobe/issues/11)) ([0a0ee44](https://github.com/artemavrin/metobe/commit/0a0ee4487d80231170c72646a39a227511f398d6))
* pin, rename and delete a chat, and a long title slides on hover ([#49](https://github.com/artemavrin/metobe/issues/49)) ([2ed4568](https://github.com/artemavrin/metobe/commit/2ed456862264b426005ddd77e34e95eb3ee2ea3e))
* providers screen — makers apart from sources, their names, logos and models ([#18](https://github.com/artemavrin/metobe/issues/18)) ([7863e99](https://github.com/artemavrin/metobe/commit/7863e995fc4def284c3615359fe5995165a6d2a0))
* proxies screen — add by address, real checks, what goes through, domains ([#19](https://github.com/artemavrin/metobe/issues/19)) ([1bdc0af](https://github.com/artemavrin/metobe/commit/1bdc0afb83c31551013114e344284cf34531e85a))
* reasoning in a window a few lines high — the newest line in view, the edges fading ([#37](https://github.com/artemavrin/metobe/issues/37)) ([eb454b6](https://github.com/artemavrin/metobe/commit/eb454b67c549d89442bd912f78d38126d702bebd))
* schema for sources, providers, models and model runs ([#10](https://github.com/artemavrin/metobe/issues/10)) ([4eff7e8](https://github.com/artemavrin/metobe/commit/4eff7e8e8984aa64b014937110762d14a96b03c1))
* service models — chat titles from a model of the admin's choice ([#28](https://github.com/artemavrin/metobe/issues/28)) ([4f27023](https://github.com/artemavrin/metobe/commit/4f27023cb05bcbbc5efc8d1c248fd12978a1aa4a))
* settings shell — one menu array, user and admin levels, appearance and region ([#14](https://github.com/artemavrin/metobe/issues/14)) ([892e819](https://github.com/artemavrin/metobe/commit/892e819506edfe49534446ce423f3845b696d600))
* sign-in pages redesigned — form beside a rotating brand panel ([#15](https://github.com/artemavrin/metobe/issues/15)) ([644e77a](https://github.com/artemavrin/metobe/commit/644e77a3acd8bef17b95ef5950df3fcc2228bc44))
* source providers — AI SDK models built from sources, keys and routes ([#12](https://github.com/artemavrin/metobe/issues/12)) ([bcf4785](https://github.com/artemavrin/metobe/commit/bcf4785d44c38582f804d5d23b841faaaed5d7a5))
* sources core — real checks, proxy auto-pick, key replace, delete with secrets ([#16](https://github.com/artemavrin/metobe/issues/16)) ([2fa1f1f](https://github.com/artemavrin/metobe/commit/2fa1f1f1c1e9e4f058958268785835672b03e76b))
* sources screen — connect with checks, drill-in list, models and prices ([#17](https://github.com/artemavrin/metobe/issues/17)) ([66510c0](https://github.com/artemavrin/metobe/commit/66510c036732b94b1076788078d02ba8273ae76d))
* tables in answers — the model streams rows into a sortable, filterable grid ([#31](https://github.com/artemavrin/metobe/issues/31)) ([89ec7ee](https://github.com/artemavrin/metobe/commit/89ec7ee326236a8f1e499d17d3db2dad65199809))
* the composer is one line that grows, with «+» for what a question brings along ([#38](https://github.com/artemavrin/metobe/issues/38)) ([dd663b1](https://github.com/artemavrin/metobe/commit/dd663b115992d0c7f9fd3175d171bed4823d704f))
* the model searches the web and reads pages, set up in /settings/search ([#42](https://github.com/artemavrin/metobe/issues/42)) ([2122e32](https://github.com/artemavrin/metobe/commit/2122e3284ed4eacd9267e9400f975ed459c6cd85))
* the work of an answer as a ribbon of steps, and the chat being named runs through letters ([#51](https://github.com/artemavrin/metobe/issues/51)) ([fa3dc6e](https://github.com/artemavrin/metobe/commit/fa3dc6e3bf0e0c8bd005f2d35a13de57c4d1f059))


### Bug Fixes

* «stop» stops the model on the server; a left answer is saved whole ([#44](https://github.com/artemavrin/metobe/issues/44)) ([cf75f9d](https://github.com/artemavrin/metobe/commit/cf75f9def6be8c536c529397caded6471392bf8d))
* a proxy counts as working when any IP echo answers through it ([#40](https://github.com/artemavrin/metobe/issues/40)) ([cad8e3c](https://github.com/artemavrin/metobe/commit/cad8e3c8120d01579d85f7e6098180bcd5bda5a3))
* an answer cut by the step limit still answers ([#41](https://github.com/artemavrin/metobe/issues/41)) ([2d405ee](https://github.com/artemavrin/metobe/commit/2d405ee58f4a565a7e71434346de79078c791234))
* an answer's cost is the sum of all its steps, and a stopped answer counts what it had used ([#50](https://github.com/artemavrin/metobe/issues/50)) ([1c179f3](https://github.com/artemavrin/metobe/commit/1c179f37a978f88eed0d96635a7cd3002e68a324))
* MCP credentials — no password characters anywhere, the shared account's form in the settings' style ([#32](https://github.com/artemavrin/metobe/issues/32)) ([0a88e0c](https://github.com/artemavrin/metobe/commit/0a88e0c23b546846cd68a9d8a4e6d0885e5ab439))
* MCP servers follow the thread; a big server's tools load on demand ([#35](https://github.com/artemavrin/metobe/issues/35)) ([2efcd47](https://github.com/artemavrin/metobe/commit/2efcd47792f365cd505124286a406d0e15272f82))
* region selects show plain values, «auto» as a quiet tag ([#8](https://github.com/artemavrin/metobe/issues/8)) ([9ac5ab0](https://github.com/artemavrin/metobe/commit/9ac5ab0e500251094193c4f8b25c3dbe6fea47d8))
* settings open on the menu's first item — «Язык и регион», now at the top ([#20](https://github.com/artemavrin/metobe/issues/20)) ([7d92b93](https://github.com/artemavrin/metobe/commit/7d92b939995e92fd66deac30790193f247a68cd2))
* the @ menu keeps its highlight — the arrows no longer snap it back to the first row ([#36](https://github.com/artemavrin/metobe/issues/36)) ([4769ae7](https://github.com/artemavrin/metobe/commit/4769ae7087a76befb67af9e8c7c70a3b2f210e83))

## [0.2.0](https://github.com/artemavrin/metobe/compare/v0.1.1...v0.2.0) (2026-09-24)


### ⚠ BREAKING CHANGES

* existing installs must rename PURR_* to METOBE_* in .env and set COMPOSE_PROJECT_NAME=purr plus POSTGRES_DB/USER/PASSWORD to the old values to keep their volumes and database (see DECISIONS D30).

### Features

* rename the project to Metobe ([#4](https://github.com/artemavrin/metobe/issues/4)) ([4669309](https://github.com/artemavrin/metobe/commit/4669309d97e0ad57880486fbfabeb783f3ffbd21))


### Bug Fixes

* provider list keeps its order and selection when models are toggled ([c09e5d8](https://github.com/artemavrin/metobe/commit/c09e5d8fe5ead71d513ee7bb36bd759e683b53bd))

## [0.1.1](https://github.com/artemavrin/purr/compare/v0.1.0...v0.1.1) (2026-09-23)


### Bug Fixes

* **install:** keep docker off stdin under curl | bash ([db6d2c1](https://github.com/artemavrin/purr/commit/db6d2c171a33422944534f0351de7dd7efa24b88))

## 0.1.0 (2026-09-23)


### Features

* add contracts, db, core packages with cli, worker and health check ([54d3910](https://github.com/artemavrin/purr/commit/54d391045865a3f44432fe69e2be7b806f775cbf))
* **auth:** passwordless sign-in with email codes and claim flow ([cefdbb1](https://github.com/artemavrin/purr/commit/cefdbb16b2d9c7c3b16727da1f3a5b7671ced75b))
* docker image, install script and CI ([7377d99](https://github.com/artemavrin/purr/commit/7377d998d0538be078c962dfaa3a5e56856f1880))
* one-line installer and release-based image publishing ([bd66fbb](https://github.com/artemavrin/purr/commit/bd66fbbe3623876db3bf1e6054cb81be464ec57b))
* **ui:** design system on shadcn and ReUI with ReUI charts
* **web:** add dev-only design system showcase ([8fb621b](https://github.com/artemavrin/purr/commit/8fb621b1bc8b2eb283024e063f5ce3cf9f48dce2))


### Bug Fixes

* **auth:** make the sign-in code input controlled ([97de1d7](https://github.com/artemavrin/purr/commit/97de1d7740fbf9dbf27704904f9b2a7cd35e6183))
* **tsconfig:** use bundler resolution for the UI package ([e13f1ef](https://github.com/artemavrin/purr/commit/e13f1ef1c1e1923a81b7979f54445003e8bdea14))
