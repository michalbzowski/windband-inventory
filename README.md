# windband-inventory

Inwentaryzacja orkiestry dętej — osobna aplikacja, blisko zintegrowana z
[windband-manager](https://github.com/michalbzowski/windband-manager)
(SSO, wspólne role bandu, odczyt danych bandu/członków przez API).

- Analiza biznesowa + decyzje v1: [`docs/w1-analiza-biznesowa-2026-10-12.md`](docs/w1-analiza-biznesowa-2026-10-12.md)
- Stack: backend Java 21 / Spring Boot 3 (DDD, PostgreSQL + Flyway), frontend React + TypeScript SPA (mobile-first).
- Konwencja jakości: `./mvnw verify` zielone przed pushem; GHA → Railway.
