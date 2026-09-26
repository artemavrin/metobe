# Changelog

## [0.3.0](https://github.com/artemavrin/metobe/compare/v0.2.0...v0.3.0) (2026-09-26)


### Features

* chat core — schema, POST /api/chat (M3.1) ([#23](https://github.com/artemavrin/metobe/issues/23)) ([ee557c3](https://github.com/artemavrin/metobe/commit/ee557c3c2b1fd58ad2004609a2f0a742a01e941e))
* chat screen — shell, thread, composer «Щелчок» (M3) ([#26](https://github.com/artemavrin/metobe/issues/26)) ([3849a50](https://github.com/artemavrin/metobe/commit/3849a502113ff70eb3db8b2cc03b9af485d09246))
* encrypted secrets store with a key canary and rotation ([#9](https://github.com/artemavrin/metobe/issues/9)) ([2d70863](https://github.com/artemavrin/metobe/commit/2d708637e75df8c8195dab2f01a8739cede57b3b))
* language and region per user — next-intl with cookies, no locale in URLs ([#6](https://github.com/artemavrin/metobe/issues/6)) ([b6ab4a2](https://github.com/artemavrin/metobe/commit/b6ab4a2cf4c817f5957ec5e28878d0f8cd2e83d3))
* model discovery from the sources themselves, exact prices per any unit ([#13](https://github.com/artemavrin/metobe/issues/13)) ([dbf1585](https://github.com/artemavrin/metobe/commit/dbf15851e74e3a52322a67c89c241ebddb18e46e))
* model picker — favorites, palette ⌘/, model peek (M3, P3) ([#27](https://github.com/artemavrin/metobe/issues/27)) ([1d280e4](https://github.com/artemavrin/metobe/commit/1d280e4b5e10849de068989bd9569ef71f9a2451))
* onboarding — source, key, models, «Metobe готов» (M2 6d) ([#21](https://github.com/artemavrin/metobe/issues/21)) ([224032b](https://github.com/artemavrin/metobe/commit/224032b78c82acc5bee25d6d02fcedef31446c13))
* outgoing network with proxies (routes, HTTP/SOCKS5, checks) ([#11](https://github.com/artemavrin/metobe/issues/11)) ([0a0ee44](https://github.com/artemavrin/metobe/commit/0a0ee4487d80231170c72646a39a227511f398d6))
* providers screen — makers apart from sources, their names, logos and models ([#18](https://github.com/artemavrin/metobe/issues/18)) ([7863e99](https://github.com/artemavrin/metobe/commit/7863e995fc4def284c3615359fe5995165a6d2a0))
* proxies screen — add by address, real checks, what goes through, domains ([#19](https://github.com/artemavrin/metobe/issues/19)) ([1bdc0af](https://github.com/artemavrin/metobe/commit/1bdc0afb83c31551013114e344284cf34531e85a))
* schema for sources, providers, models and model runs ([#10](https://github.com/artemavrin/metobe/issues/10)) ([4eff7e8](https://github.com/artemavrin/metobe/commit/4eff7e8e8984aa64b014937110762d14a96b03c1))
* service models — chat titles from a model of the admin's choice ([#28](https://github.com/artemavrin/metobe/issues/28)) ([4f27023](https://github.com/artemavrin/metobe/commit/4f27023cb05bcbbc5efc8d1c248fd12978a1aa4a))
* settings shell — one menu array, user and admin levels, appearance and region ([#14](https://github.com/artemavrin/metobe/issues/14)) ([892e819](https://github.com/artemavrin/metobe/commit/892e819506edfe49534446ce423f3845b696d600))
* sign-in pages redesigned — form beside a rotating brand panel ([#15](https://github.com/artemavrin/metobe/issues/15)) ([644e77a](https://github.com/artemavrin/metobe/commit/644e77a3acd8bef17b95ef5950df3fcc2228bc44))
* source providers — AI SDK models built from sources, keys and routes ([#12](https://github.com/artemavrin/metobe/issues/12)) ([bcf4785](https://github.com/artemavrin/metobe/commit/bcf4785d44c38582f804d5d23b841faaaed5d7a5))
* sources core — real checks, proxy auto-pick, key replace, delete with secrets ([#16](https://github.com/artemavrin/metobe/issues/16)) ([2fa1f1f](https://github.com/artemavrin/metobe/commit/2fa1f1f1c1e9e4f058958268785835672b03e76b))
* sources screen — connect with checks, drill-in list, models and prices ([#17](https://github.com/artemavrin/metobe/issues/17)) ([66510c0](https://github.com/artemavrin/metobe/commit/66510c036732b94b1076788078d02ba8273ae76d))


### Bug Fixes

* region selects show plain values, «auto» as a quiet tag ([#8](https://github.com/artemavrin/metobe/issues/8)) ([9ac5ab0](https://github.com/artemavrin/metobe/commit/9ac5ab0e500251094193c4f8b25c3dbe6fea47d8))
* settings open on the menu's first item — «Язык и регион», now at the top ([#20](https://github.com/artemavrin/metobe/issues/20)) ([7d92b93](https://github.com/artemavrin/metobe/commit/7d92b939995e92fd66deac30790193f247a68cd2))

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
