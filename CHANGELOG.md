# Changelog

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
