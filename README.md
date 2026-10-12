# windband-inventory

Inwentaryzacja orkiestry dętej — osobna aplikacja, blisko zintegrowana z
[windband-manager](https://github.com/michalbzowski/windband-manager)
(SSO, wspólne role bandu, odczyt danych bandu/członków przez API).

- Analiza biznesowa + decyzje v1: [`docs/w1-analiza-biznesowa-2026-10-12.md`](docs/w1-analiza-biznesowa-2026-10-12.md)
- Stack: backend Java 21 / Spring Boot 3 (DDD, PostgreSQL + Flyway), frontend React + TypeScript SPA (mobile-first).
- Konwencja jakości: `./mvnw verify` zielone przed pushem; GHA → Railway.

## Deploy (Railway)

Kontener jest budowany przez **Dockerfile w korzeniu repo** (provider Docker —
Railway wykrywa go automatycznie po podpięciu tego repo do projektu):

1. Railway: podłącz repo `michalbzowski/windband-inventory` do serwisu (push = build).
2. Zmienna środowiskowa **`WM_API_URL`** = realny adres windband-managera w Twoim
   środowisku (host + opcjonalnie ścieżka, bez końcowego `/`). To cel proxy
   `/api/v1`; przeglądarka widzi API jako same-origin, jak lokalnie przy
   `vite dev` (bez CORS). Adres jest podstawiany w nginx za pomocą env —
   zmiany nie wymagają przebudowy obrazu.
3. Klucz Keycloak: klient `windband-inventory-local` musi mieć w Valid redirect
   URIs dokładnie adres, do którego aplikacja przekierowuje po logowaniu —
   zawsze `<host aplikacji>/callback`. Lokalny env: `http://localhost:5173/callback`;
   dla środowisk produkcyjnych dopisz konkretny host (np. domena przypisana w
   Railway) — zarządzany kodowo w repo WC: `keycloak/import/windband-realm.json`
   (nie wpisuj ręcznie w dashboardzie, bo nadpisze go kolejny import realmu).

Lokalnie (opcja, bez Railway):

```sh
docker build -t windband-inventory .
# --network host: proxy /api trafia na WM uruchomione na hostach :8080
docker run --rm --network host \
  -e WM_API_URL=http://localhost:8080 windband-inventory
# → http://localhost (nginx na porcie 80 hosta)
```
