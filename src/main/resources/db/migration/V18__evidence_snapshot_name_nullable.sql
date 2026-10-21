-- V16 zlibuzował nazwę pozycji w inventory_items (identyfikatorem jest kod
-- programowy), ale tabele-evidence zamroziły name jako NOT NULL. Efekt:
-- deklaracja posiadania / potrzeba / wiersz spisu dla pozycji BEZ nazwy
-- (np. instrument INS-0001) crashował na 23502 (raport produkcyjny 2026-10-21).
-- Snapshot znosi kolumnę do NULL — dowód bez nazwy istnieje, czytnikiem jest
-- serial_number; UI już renderuje fallback serial||name.
ALTER TABLE ownership_declarations ALTER COLUMN name DROP NOT NULL;
ALTER TABLE inventory_needs      ALTER COLUMN name DROP NOT NULL;
ALTER TABLE stocktake_lines      ALTER COLUMN name DROP NOT NULL;
