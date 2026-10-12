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

1. Railway: podłącz repo `michalbzowski/windband-inventory` do Projektu
   **obok serwisów windband-manager / keycloak** (push = build). Dzięki temu
   działa private networking `<service>.railway.internal`.

### Zmienne środowiskowe (build-time — Railway podstawia je podczas `npm run build`)

| Zmienna | Wartość produkcyjna |
|---|---|
| `WM_API_URL` | `http://windband-manager.railway.internal:8080` (private networking; cel proxy `/api/v1`) |
| `VITE_AUTH_ISSUER` | `https://login.bandmanager.pl/realms/windband` |
| `VITE_CLIENT_ID` | `windband-inventory-local` |

Nginx podstawia `WM_API_URL` do zbudowanej konfiguracji **przy starcie**
kontenera (template envsubst) — zmiana celu nie wymaga przebudowy obrazu.
Przeglądarka widzi API jako same-origin (bez CORS), tak samo jak lokalnie przy
`vite dev`.

### Klucz Keycloak (ważne!)

Aplikacja zawsze przekierowuje się po logowaniu do `<host aplikacji>/callback`
(patrz `frontend/src/auth/oidc.ts`). Ten dokładny adres musi być w Valid
redirect URIs klienta `windband-inventory-local` w realmie `windband`.

⚠️ **Keycloak NIE akceptuje wildcardów w hostach** redirect URI (zaweryfikowane
empirycznie na KC 26: `https://*.bandmanager.pl/callback` nie dopuszcza faktycznego
hosta). Rejestracja musi być konkretna, np. po przypisaniu domeny:

```text
https://inw.bandmanager.pl/callback
```

Uwaga: jeśli realm produkcyjny jest seedowany z `keycloak/import/windband-realm.json`
w repo windband-manager, dopisz ten adres do tego pliku (i do lokalnego KC),
a nie do dashboardu KC ręcznie — bo nadpisze go kolejny import realmu.

### Publiczna domena / TLS w Railway

Railway wymaga **dwóch** rekordów DNS dla custom domain (nie tylko CNAME):
CNAME + TXT `_railway-verify.<subdomena>` (weryfikacja własności i certyfikat
Let's Encrypt). Bez TXT domena zwraca 404 `x-railway-fallback: true`.

Lokalnie (opcja, bez Railway):

```sh
docker build -t windband-inventory .
# --network host: proxy /api trafia na WM uruchomione na hostach :8080
docker run --rm --network host \
  -e WM_API_URL=http://localhost:8080 windband-inventory
# → http://localhost (nginx na porcie 80 hosta)
```
