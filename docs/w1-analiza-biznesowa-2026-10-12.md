# windband-inventory — Analiza biznesowa i decyzje v1 (R1–R5)

Data: 2026-10-12 · Status: **WYMAGANIA ZAMROZONE** (wszystkie rundy R1–R5 zamknięte z właścicielem)
Repo: https://github.com/michalbzowski/windband-inventory → źródło prawdy tego dokumentu.

## Kontekst

Moduł inwentaryzacji orkiestry dętej istniał w `windband-manager` (jednolity model
`InventoryItem` + silnik atrybutów, PR #266/#270, plan 2026-10-09). Decyzja właściciela:
wyniesienie go do **osobnej aplikacji** `windband-inventory`, blisko zintegrowanej z WM.
Kontekst decyzyjny odziedziczony (decyzje D1–D4 z 2026-10-09, niezakwestowane):

| # | Dziedziczone |
|---|---|
| D1 | Jeden konkretny `InventoryItem` + silnik atrybutów; typ przez enum `ItemType` (UNIFORM, INSTRUMENT, AWARD, SHEET_MUSIC, EQUIPMENT, CONSUMABLE, DOCUMENT, OTHER) — brak podklas Java |
| D2 | Zakres spisu obejmuje: stan magazynowy + kto co trzyma + deklaracje posiadania; kluczowy widok = oczekiwany vs faktyczny (full picture — w v1.x) |
| D3 | Legacy `Uniform/Instrument/Award` — zamknięte (usunięte z WM w F2); w nowej aplikacji ich śladu nie ma |
| D4 | Workflow serwisów w roadmapzie; JasperReports odłożone |

## Rejestr decyzji v1 (definitywnie, 2026-10-12)

| # | Decyzja | Wyjaśnienie |
|---|---------|-------------|
| B1 | **WM = master** danych bandów i członków; inventory odczytuje wyłącznie przez API | Brak duplikacji encji Band/Member w inventory |
| B2 | Po stabilnym v1: **usunięcie modułu z WM** + link do inventory (SSO) | Cutover opisany w sekcji 6 |
| B3 | **Fresh start** — brak migracji danych; legacy w WM traktowane jako zamknięte | ⚠️ przy cutoverze dane z WM (pozycje, przydziały) nie przechodzą do inventory — decyzja świadoma |
| B4 | v1 = **F5 stocktake (rdzeń)** + minimalna baza, reszta backlogu v1.x | Patrz sekcja 3/4 |
| B5 | **Ten sam realm Keycloak** `windband`, role bandu z WM (ADMIN/MEMBER) | SSO między aplikacjami |
| B6 | Baza v1: pozycje+atrybuty, **przydział/zwrot z historią**, magazyny MAIN/SERVICE/ARCHIVE + transfery, listy z filtrami | Rozstrzygnięcie rozbieżności: F5 czyta stany ASSIGNED → przydziały wchodzą do bazy v1 |
| B7 | Specyfikacja **F5 z planu 2026-10-09 przyjęta w całości** (encje, UX mobile, pause/resume + offline queue, diff report, close) | Dostosowana na frontend SPA (patrząc NFR) |
| B8 | Upoważnienia stocktake: **start i zamknięcie: ADMIN bandu**; liczenie: dowolny **MEMBER** aktywny bandu, zapis `countedBy` | Role = `TeamRole.ADMIN/MEMBER` z WM |
| B9 | Zamknięcie v1: **raport rozbieżności (4 sekcje)**, przyciski akcji (Potrzeba/Serwis) **nieaktywne** do wdrożenia modułów v1.x | BRAK/USZKODZONE „zawieszają” się jako sugestia |
| B10 | Kontrakt API z WM = minimum v1: bandy usera + członkowie (id, imię, nazwisko, rola) + **oczekiwany zestaw** per członek (instrument/strój) | Pełniejszy kontrakt (stany członka, kontaktowe) — w razie potrzeby w v1.x |
| B11 | Nawigacja **jednostronna**: link z WM do inventory (dashboard bandu / karta ekwipunku); bez przycisku powrotu w v1 | Środek user-flow = inventory |
| B12 | Stack: backend wzorzec WM (Java 21, Spring Boot 3, DDD, PG+Flyway, Railway, GHA), **frontend: React + TypeScript SPA** nad REST | Odchodzenie od Thymeleaf/Pico/HTMX — decyzja B5-R5 |
| B13 | **Skill-i Hermes: 4 sztuki** dla repo `windband-inventory`, utworzone przed pierwszym PR | workflow, stack-nfr, wm-integration, deployment |
| B14 | **Deklaracje posiadania (v1.x #4, 2026-10-14)**: dowodowy wiersz `OwnershipDeclaration` — typu `PRIVATE` (pozycja trzymana prywatnie; osoba z rosteru WM) lub `EXTERNAL` (miejsce poza magazynem; opis lokalizacji wymagany). Deklaracja NIE zmienia magazynu ani statusu życia (magazyn = prawda formalna, deklaracja = fakt terenowy; ich połączenie to pełny obraz w1.x #1). Jedna `ACTIVE` deklaracja na pozycję (częściowy unikalny index), ścieżka `ACTIVE → REVOKED` bez reaktywacji; pozycja `ASSIGNED` nie podlega deklaracji (409 — formalny przydział jest mocniejszym dowodem). Utworzenie: ADMIN lub aktywny CZŁONEK (re-walidacja składu przez roster WM, analogicznie do B10 przy zliczeniach); odwołanie: ADMIN; odczyt: członek bandu | Rejestry magazynowe nie łapią stanu faktycznego (instrumenty „od lat w piwnicy u prezesa”) — bez tego spis i pełny obraz kłamią |
| B15 | **Serwis — planża zgłoszeń napraw (2026-10-19)**: widok „Potrzeby i zamówienia" przemianowany na **„Zamówienia i serwis"** z segmentami **Zamówienia \| Serwis**. Sekcja SERWIS = nowy dowodowy wiersz `ServiceJob` (zgłoszenie naprawy istniejącej pozycji). Maszyna stanów: `ZGROSZONE → WYSLANE_DO_SERWISU → NAPRAWIONE → DO_ODBIORU → W_MAGAZYNIE → PRZEKAZANO`; `ANULOWANE` dostępne wyłącznie z `ZGROSZONE`; terminale: `PRZEKAZANO`, `ANULOWANE`. Jedno niewykonywane zgłoszenie na pozycję (częściowy unikalny index); guard przejść w domenie (409). **Efekty na pozycji, jedna transakcja:** WYSLANE = zdjęcie przydziału (`unassign`, jeśli `ASSIGNED`) + `IN_SERVICE` + magazyn `SERVICE`; W_MAGAZYNIE = `AVAILABLE` + magazyn `MAIN`; PRZEKAZANO = re-przypisanie do reporter-a (snap-shot `member_id+name` z momentu zgłoszenia; pozycja zostaje w `MAIN`, stan `ASSIGNED`). Instrument liczy się nadal na stanie bandu (poza spitem F5, który czyta `AVAILABLE/ASSIGNED`). Otwarcie i akcje: **ADMIN** (B8); samosłużba członka w v2. Stare `InventoryNeed` pozostaje w rejestrze jako dowód; UI pod segmentem Zamówienia | Proces fizyczny naprawy musi być śledzony jak Zamówienia (dowód + statusy+efekty magazynowe/przydziałowe); sam F4 to tylko stan flagowy pozycji bez efektów i bez „naprawione/odbieraj" |

## 2. Osoby i role

| Rola (WM) | Prawa w inventory v1 |
|---|---|
| ADMIN bandu X | start + zamknięcie stocktake; CRUD pozycji/atrybutów/magazynów/transfery; przydział i zwrot; pełna widoczność bandu X |
| MEMBER aktywny bandu X | liczenie w stocktake (`countedBy`), odczyt list, przegląd własnych przydziałów; nie start/close |
| Użytkownik bez przynależności do bandu X | brak dostępu do danych bandu X (authz na warstwie API) |

Notatka: role istnieją w **bazie WM** (`UserTeamRole` + `TeamRole`), NIE w claimach
OIDC → inventory musi je brać z API WM (B10) i nie może ich wyprowadzać z tokenu.

## 3. Zakres funkcjonalny v1 (P0)

### 3.1 Baza wspierająca (B6)
- **Pozycje**: CRUD `InventoryItem` + dynamiczne atrybuty (`ItemAttributeDef/Value`,
  per band/per typ, `displayOrder`, typy: NUMBER/SELECT/MULTI/BOOLEAN/DATE/TEXT);
  formularz dwustopniowy: wybór typu → render def-ów.
- **Przydział/zwrot**: `assignTo/unassign` z wpisem w historię (assignedAt,
  returnedAt, notka, stan przy zwrocie). Stan życia: AVAILABLE / ASSIGNED / IN_SERVICE /
  RETIRED / DISPOSED / LOST.
- **Magazyny**: MAIN/SERVICE/ARCHIVE + `WarehouseTransfer` (historia przeniesień).
  Doprecyzowanie (2026-10-14, feature "warehouse-transfers"): jedyną ścieżką zmiany
  magazynu jest transfer (historia = fakt); PUT pozycji przyjmuje wyłącznie magazyn
  niezmieniony. Przenosić można pozycje AVAILABLE/IN_SERVICE/RETIRED — ASSIGNED
  (u osoby), LOST i DISPOSED nie zmieniają magazynu. Pozycja z jakąkolwiek
  historią (przydziały lub przeniesienia) nie podlega DELETE (409) — historia
  jest dowodem (baza pod F3 w v1.x).
- **Listy z filtrami**: typ, status, magazyn, przypisana osoba (+ atrybut wg definicji z listy).

### 3.2 Core: moduł inwentaryzacji (stocktake, spec F5)
- **Encje**: `Stocktake` (band, startedBy, startedAt/finishedAt, status
  DRAFT/IN_PROGRESS/CLOSED, notes) + `StocktakeLine` (itemId, expectedQty=1,
  expectedStatus AVAILABLE|ASSIGNED, foundState OK/BROKEN/MISSING/EXTRA, note,
  countedBy, countedAt). Snapshot = aktywne pozycje bandu + ich przydziały.
- **UX mobile-first**: filtry startu (typ/status/magazyn) → lista kart
  (nazwa, numer seryjny, osoba gdy przypisana); tap na kartę → **3 duże przyciski
  OK ✓ / BRAK ✗ / USZKODZONE ⚠** (+ stan „inny”); OK = auto-next ~500 ms;
  BRAK/USZK = opcjonalna notka + auto-next; bottom bar z progress (n/N) i licznikiem
  rozbieżności live; **pause/resume**; **offline queue** (localStorage, flush po
  reconnection pod istniejącym `stocktakeId`).
- **Zamknięcie**: raport diff w 4 sekcjach (OK / Brakuje / Uszkodzone / Nadwyżka);
  przyciski akcji (BRAK→Potrzeba, USZK→Serwis) **disabled** do v1.x; CLOSED blokuje edycję.
- **API (kontrakt wewnętrzny inventory)**: `POST /api/inventory/stocktakes`,
  `PUT /api/inventory/stocktake-{id}/lines/{lineId}`, `GET .../summary`,
  `PATCH .../close`. Double-close → reject. Authz: aktywni użytkownicy bandu.
- **Testy**: pełny flow start→liczenie (≥5 pozycji z rozbieżnościami)→close→raport;
  double-close reject; permission test (użytkownik innego bandu → 403);
  E2E UI na viewport 360 px; update linii < 500 ms.
- **Doprecyzowanie (2026-10-14, implementacja F5)**:
  - ścieżki kanoniczne REST: `POST /api/inventory/stocktakes?bandId=` (start +
    snapshot synchronicznie), `GET /{id}`, `GET /{id}/lines[?state=OK|MISSING|BROKEN|EXTRA]`,
    `GET /{id}/summary`, `PUT /{id}/lines/{lineId}` (liczenie/poprawka),
    `POST /{id}/lines` (dopisanie nadwyżki), `PATCH /{id}/pause|resume|close`.
    Skrót „stocktake-{id}” z pierwotnego zapisu = `/stocktakes/{id}/…`.
  - `DRAFT` = stan pauzy; start daje od razu `IN_PROGRESS`; jedyna dopuszczalna
    ścieżka domknięcia to `IN_PROGRESS → CLOSED` (pauza wymusza wznowienie przed close).
  - **Single-open**: w jednym bandzie istnieje co najwyżej jeden spis edytowalny
    (`DRAFT` lub `IN_PROGRESS`); drugi `POST` → `409 status_conflict`. Hub UI,
    „dołącz do liczenia" i raport zakładają jednoznaczność aktywnego spisu.
  - **Kroj frontendu (2026-10-14)**: mobilny moduł Liczenie w `frontend/` — ekran
    startu (snapshot + podgląd zakresu), karta liczenia (OK/BRAK/USZKODZONE,
    nadwyżka, notacje, auto-next, toast Cofnij), pauza/wznowienie, raport 4-sekcyjny
    ze stemplem, kolejka offline w localStorage (klucz `wi.countQueue.v1`,
    last-word-wins) z auto-flushem po sieci; tożsamość liczącego wybierana z
    rosteru WM raz na band (`wi.identity.<bandId>`). Testy: vitest (queue/progress)
    + Playwright e2e na mocku kontraktu (flow pełny, offline, nadwyżka, single-open).
  - `countedBy`: WM celowo nie mapuje członków na użytkowników (kontrakt §B10),
    więc żądanie liczenia niesie `countedMemberId`, a serwer weryfikuje je przy
    każdym zapisie względem żywej listy roster WM (jak przy przydziałach);
    `startedBy` = subject Keycloaka administratora, który otworzył spis.
  - `foundState` OK/BROKEN/MISSING należą do liczenia snapshotu; EXTRA jest
    zarezerwowane dla dopisanych jednostek (POST lines). Ostatnie słowo liczącego
    wygrywa do momentu zamknięcia (korekty offline flush).
  - pauza/wznowienie = ADMIN (analogia B8: sterowanie biegiem spisu).
  - pozycja ujęta w jakimkolwiek spisie staje się nieusuwalna (DELETE → 409 —
    dowody F3); NFR < 500 ms na update linii nie jest asercją w CI (flaky).

### 3.3 Poza zakresem v1 (wprost)
Brak: migracja danych (B3), dwustronna nawigacja (B11), stany członka/kontaktowe z API
(BM — pełny kontrakt), raporty Jasper, skanowanie QR/kodu, reguły warunkowe atrybutów v2.

## 4. Backlog v1.x (kolejność priorytetowa po v1)

> **Status 2026-10-19: cały backlog v1.x zrealizowany** — 1: F3 `MemberPicture`
> (PR #16–17), 2: F4 serwis (sheety w szczegółach pozycji + filtr „Do serwisu”),
> 3: planża „Potrzeby i zamówienia” (PR #29; backend #20), 4: deklaracje (PR #18–19),
> 5: akcje spisu + krok wydruku raportu (PR #20). Z §3.3 wyszło już: reguły
> warunkowe atrybutów (PR #28), liczniki Pulpitu z deep-linkami (PR #32),
> **zamówienia nowych przedmiotów** z pełnym flow sześciostanowym i efektami
> magazynowymi — dostawa tworzy pozycję, odbiór przypisuje ją osobie (PR #33);
> potrzeba na istniejącej pozycji jest teraz oznaczona w UI jako zgłoszenie
> serwisowe.
> **Plan (B15, 2026-10-19):** widok przemianowany na „Zamówienia i serwis";
> sekcja Serwis = planża zgłoszeń napraw z 7-stanowym flow i efektami
> przydziałowymi/magazynowymi (decyzje: ADMIN otwarcie, anulowanie tylko do
> wysłania, powrót do MAIN).
> **Zrealizowane 2026-10-19 (PR #44): skanowanie QR/kodu** — etykieta pozycji
> (ADMIN: szczegóły → 🏷) niesie krótki kod `WI-{band}-{id}` jako QR + tekst
> (format ~50×25 mm, izolowany arkusz druku); ekran „Skanuj etykietę"
> (Ekwipunek → 📷): wpis ręczny kodu/linku = droga główna offline, opcjonalny
> aparat (jsQR, getUserMedia); kod z innego zespołu twardo odrzucany; parser
> `src/scan/model.ts` pokryty testami.
> Pozostaje w kolejności: dwustronna nawigacja (B11), stany członka z API BM — a
> **na sam koniec kolejki: raporty Jasper** (decyzja właściciela 2026-10-19).

1. F3 full picture per member: oczekiwane (z API WM) vs faktyczne vs gap + history widokowa
2. F4 workflow serwisu: `sendToService → IN_SERVICE → completeService`, `nextServiceDate`,
   lista „do serwisu”
3. Potrzeby/Zamówienia (`InventoryNeed` + status) — odblokowuje akcję BRAK z raportu
4. Deklaracje posiadania prywatnego/zewnętrznego
5. Aktywne przyciski akcji w stocktake (po 2+3), wersja wydruk/krok PDF raportu

## 5. NFR / Stack (B12)
| Warstwa | Standard |
|---|---|
| Backend | Java 21, Spring Boot 3, DDD (adapter/application/domain), PostgreSQL + Flyway (`IF NOT EXISTS`, kwoty w `*_text`), REST/JSON |
| Frontend | **React + TypeScript SPA**, mobile-first ≥360 px, brak horizontal scroll, tap-targets ≥44 px, pinned bottom bar, offline queue (localStorage) |
| Authz | OIDC ten sam realm `windband` (env `KEYCLOAK_REALM`); role z API WM (B10) |
| Jakość | Checkstyle + SpotBugs + ArchUnit + testy jednostkowe + Testcontainers + E2E UI; `./mvnw verify` zielone przed każdym push (konwencja WM) |
| CI/CD | GitHub Actions → Railway (wzorzec WM; skill `windband-inventory-deployment`) |

## 6. Cutover z windband-manager (B2, po stabilnym v1)
1. Snapshot/backup bazy WM (Railway + `pg_dump` lokalny). — **po stronie właściciela**, przed wdrożeniem PR-1.
2. ~~Freeze modułu inventory w WM (read-only w UI, wyłączenie zapisów w API)~~ ✅ 2026-10-15: WM PR #276 — `InventoryWriteFreezeFilter` (410 Gone na POST/PUT/PATCH/DELETE pod `/api/inventory/**` i `/band/inventory-attributes/**`); wycofanie bez kodu: `INVENTORY_WRITE_FREEZE=false`.
3. Usunięcie kodu legacy + encji z WM (PR w repo WM) — **uzgodnione 2026-10-15: PR-2 po testach produkcyjnych** (użytkownik chce zostać z podglądem read-only).
4. ~~Link WM→inventory~~ ✅ częściowo wcześniej (menu `📦 Inwentaryzacja` #274, `app.inventory-url`); PR #276 dokłada banner „tylko do odczytu → Otwórz Inventory" na Zasobach i Atrybutach (używa tego samego mechanizmu `inventoryExternalUrl`).
5. Weryfikacja po PR-2: zero encji inventory w `src/` WM (ArchUnit), zielone `./mvnw verify`.

## 7. Otwarte przed startem kodowania (do zamknięcia w PR-ach / setupie)
1. ~~Dokładny kontrakt REST WM endpointów B10~~ ✅ zaimplementowane w WM: branch `feat/inventory-integration-api` @ `16efdc43` (`GET /api/v1/me/bands`, `GET /api/v1/bands/{bandId}/members`; rola ADMIN/MEMBER; expectedSet per członek).
2. Rejestracja klienta OIDC SPA inventory w realmie `windband` (krok Keycloak-admin).
3. Wybór narzędzia E2E dla SPA (rekomendacja: Playwright) — do potw. przy scaffoldzie.
4. Nazwy URL + scheme deploya Railway pod domain/inventory.

## 8. Skill-i Hermes (B13)
Zgodnie z decyzją przed pierwszym PR powstaną w profilu domyślnym:
`windband-inventory-workflow`, `windband-inventory-stack-nfr`,
`windband-inventory-wm-integration`, `windband-inventory-deployment`.
