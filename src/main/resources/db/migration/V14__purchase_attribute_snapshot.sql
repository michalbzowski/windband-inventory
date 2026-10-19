-- Zamówienia: snapshot wartości atrybutów (te same definicje co formularz „Nowa pozycja").
-- JSON: [{"attributeDefId":12,"name":"Wzrost","value":"180"}, ...]; null = zamówienie bez atrybutów.
ALTER TABLE purchase_requests ADD COLUMN attribute_snapshot TEXT;
