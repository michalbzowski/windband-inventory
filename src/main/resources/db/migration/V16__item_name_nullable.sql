-- Nazwa pozycji jest od tej pury opcjonalnym polem wewnętrznym (roadmapa
-- 2026-10-20, zad. 1): UI identyfikuje pozycję typem + kodem nadanym przez
-- program (serial_sequences), a użytkownik nigdy nie wpisuje nazwy — więc nie
-- może ona blokować zapisu NULL-em. Istniejące wartości zostają nietknięte.
ALTER TABLE inventory_items ALTER COLUMN name DROP NOT NULL;
