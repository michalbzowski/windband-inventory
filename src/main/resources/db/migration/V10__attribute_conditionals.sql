-- v2.0 reguły warunkowe atrybutów (w1-analiza §3.3): atrybut zależny pokazuje się
-- tylko, gdy wartość atrybutu-rodzica (SELECT, ten sam band+typ, płaska hierarchia)
-- należy do depends_on_values. Format depends_on_values identyczny jak options (';').
ALTER TABLE item_attribute_defs ADD COLUMN depends_on_def_id BIGINT;
ALTER TABLE item_attribute_defs ADD COLUMN depends_on_values TEXT;
