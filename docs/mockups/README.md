# Makieta UI mobile — windband-inventory v1

Plik: `w1-makieta-ui-mobile.html` — self-contained design board (otwórz w przeglądarce, najlepiej ≥1600 px szerokości).

**Podstawa wymagań:** `docs/w1-analiza-biznesowa-2026-10-12.md` (R1–R5, decyzje zamrożone).
Makieta realizuje w szczególności: F5 stocktake w całości (B7), bazę v1 (B6), role ADMIN/MEMBER (B8),
raport 4-sekcyjny z nieaktywnymi akcjami (B9), SSO + nawigację jednostronną (B5/B11),
kontrakt WM dla bandów/członków (B10) i NFR mobile-first 360 px / tap ≥44 px / pinned bottom bar / offline queue.

## Zawartość boardu (17 ekranów)

| Flow | Ekrany |
|---|---|
| IA | mapa 4 zakładek + warianty ról |
| A · Wejście | 01 wybór bandu (SSO), 02 Pulpit bandu |
| B · Baza (B6) | 03 lista + filtry, 04 szczegóły pozycji, 05 sheet przydziału, 06–07 wizard nowej pozycji (typ → atrybuty) |
| C · Spis F5 (B7) | 08 panel startu, **09 liczenie (interaktywne demo)**, 10 stan z notatką, 11 offline + kolejka, 12 pauza/wznów, 13 hub „Liczenie" |
| D · Zamknięcie (B9) | 14 raport diff + close z confirmają, 15 raport read-only |
| E · MEMBER | 16 moje przydziały + liczenia, 17 sheet zwrotu |
| DS / TR | design tokens + tabele typografii; macierz traceability wymóg→ekran |

Ekran 09 jest **interaktywny**: OK = auto-next ~500 ms, BRAK/USZKODZONE/inny stan = panel notatki
(opcjonalna) + „Zapisz i dalej", pominięcie notatki = auto-next natychmiast + toast „Cofnij ↩",
licznik rozbieżności live, progress n/N + meter w pinned bottom barze.

## Rozstrzygnięte decyzje projektowe (2026-10-12)

- **Q1** „Inny stan…" = **inline-chips** pod przyciskami decyzji (＋ Nadwyżka · 🔧 W serwisie · 📦 Wycofany), bez osobnego ekranu.
- **Q2** auto-next przy BRAK bez notatki = **natychmiast + toast „Cofnij"** (nie łamie specu B7, notatka nigdy nie blokuje).
- **Q3** filtr „Osoba" na liście ekwipunku = **dostępny MEMBER-owi**, tryb read-only.

## Status

Maketa koncepcyjna do walidacji — po zaakceptowaniu: tokeny + IA + stany 09–13 → komponenty React/TS w `frontend/`.
