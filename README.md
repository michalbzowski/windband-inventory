# windband-inventory

Inwentaryzacja orkiestry dętej — osobna aplikacja, blisko zintegrowana z
[windband-manager](https://github.com/michalbzowski/windband-manager)
(SSO, wspólne role bandu, odczyt danych bandu/członków przez API).

- Analiza biznesowa + decyzje v1: [`docs/w1-analiza-biznesowa-2026-10-12.md`](docs/w1-analiza-biznesowa-2026-10-12.md)
- Stack: backend Java 21 / Spring Boot 3 (DDD, PostgreSQL + Flyway), frontend React + TypeScript SPA (mobile-first).
- Konwencja jakości: `./mvnw verify` zielone przed pushem; GHA → Railway.

## Deploy (Railway)

Frontend/edge jest budowany przez **Dockerfile w korzeniu repo** (nginx+SPA —
provider Docker, Railway wykrywa go automatycznie po podpięciu repo):
Backend Spring buduje **`Dockerfile.backend`** — to DRUGA usługa z tego samego
repo: Settings → Build → Dockerfile path = `Dockerfile.backend`, target port
usługi/domeny **8090**, zmienne wg komentarza w tym pliku.

1. Railway: podłącz repo `michalbzowski/windband-inventory` do Projektu
   **obok serwisów windband-manager / keycloak** (push = build). Dzięki temu
   działa private networking `<service>.railway.internal`.

### Zmienne środowiskowe (RUNTIME — jeden obraz dla każdego środowiska)

Każda wartość zależna od środowiska jest zmienną ENV podstawianą **przy starcie**
kontenera — kod produkcyjny i build są identyczne wszędzie, środowiska różnią się
TYLKO zmiennymi. Nginx (oficjalny obraz) renderuje `/etc/nginx/templates/*.template`
przez envsubst przy starcie, więc `deploy/nginx/env.js.template` → `/env.js` dla SPA;
lokalnie serwer dev Vite serwuje ten sam `/env.js` z `process.env`.

| Zmienna | Rola | Domyślna (local) | Produkcja |
|---|---|---|---|
| `AUTH_ISSUER` | Issuer Keycloak (URL realmu) do loginu i wymiany kodu | `http://localhost:8180/realms/windband` | `https://login.bandmanager.pl/realms/windband` |
| `AUTH_CLIENT_ID` | OIDC `client_id` (kanoniczna nazwa klienta) | `windband-inventory` | `windband-inventory` (domyślna wystarczy) |
| `WM_API_URL` | Cel proxy same-origin `/api/v1` → windband-manager | `http://localhost:8080` | `https://app.bandmanager.pl` (razem z `NGINX_RESOLVER=8.8.8.8`) |
| `NGINX_RESOLVER` | DNS używany przez nginx do nazw upstreamów | `127.0.0.11` (DNS Dockera) | `8.8.8.8` — uwaga poniżej |
| `BACKEND_API_URL` | Cel proxy same-origin `/api/inventory/` → backend Spring | `http://localhost:8090` | publiczna domena usługi backendu lub internal (patrz ostrzeżenie niżej) |

⚠️ **Pułapka DNS (potwierdzona produkcyjnie 2026-10-14):** z `NGINX_RESOLVER=8.8.8.8`
nginx NIE rozwiąże `*.railway.internal` — to publiczny DNS, a nazwy prywatnej sieci
są dostępne tylko z wewnętrznego DNS Railway (`/etc/resolv.conf` kontenera; obraz
nginx eksportuje go jako `NGINX_LOCAL_RESOLVER`). Stąd: adresy `…railway.internal`
działają **w JVM** (backend → WM/Keycloak — Java czyta resolv.conf) i **nie** mogą
być wpisywane wprost do zmiennych proxy nginx, dopóki resolver nie wskazuje na DNS
Railway. Bezpieczny wariant dla nginx: publiczne domeny (`app.bandmanager.pl`,
`<backend>.up.railway.app`).

Redirect powrotny po logowaniu to ZAWSZE `<origin aplikacji>/callback`, liczony w
przeglądarce z `window.location.origin` — nie jest zmenną ani parametrem buildu.
Jedyne, co musi zgadzać się per środowisko: ten dokładny adres musi być na liście
Valid redirect URIs klienta w Keycloak (patrz niżej).

### Klucz Keycloak (ważne!)

Aplikacja zawsze przekierowuje się po logowaniu do `<host aplikacji>/callback`
(patrz `frontend/src/auth/oidc.ts`). Ten dokładny adres musi być w Valid
redirect URIs klienta **`windband-inventory`** (jedyna kanoniczna nazwa client_id)
w realmie `windband`.

⚠️ Zdarzono się z tym (2026-10-12/13): w realmie `windband` istniały **dwa
rekordy klienckie o tym samym `clientId`** (wtedy `windband-inventory-local`,
dziś kanoniczne `windband-inventory`) — jeden z importu JSON, drugi utworzony
ręcznie. Keycloak rozwiązywał zapytanie auth do *tego drugiego*, uboższego
(redirekcje: tylko localhost) → stałe `400 invalid_redirect_uri` mimo że „ten
client" w dashboardzie miał dokładny `https://.../callback`. Log KC potwierdza:
`LOGIN_ERROR ... error="invalid_redirect_uri", redirect_uri="http://inventory.bandmanager.pl/callback"`.
**Po scaleniu do jednego clienta (i usunięciu duplikatu) auth przechodzi 200.**

Lekcja przy debugowaniu: zawsze wypisuj **pełną listę klientów z UUID**
(`GET /admin/realms/{realm}/clients`) — zapytanie `?client_id=...` może zwrócić kilka
linii, a interfejs admina operuje na pierwszej z nich.

Uwaga: jeśli realm produkcyjny jest seedowany z `keycloak/import/windband-realm.json`
w repo windband-manager, dopisz adres w TYM PLIKU (i do lokalnego KC) — nie ręcznie
w dashboardzie KC — bo kolejny import realmu go nadpisze.

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
