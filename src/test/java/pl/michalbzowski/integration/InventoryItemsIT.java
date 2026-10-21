package pl.michalbzowski.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.willThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import pl.michalbzowski.inventory.application.port.WmUnavailableException;

/**
 * Item CRUD over REST with the full v1 authorization matrix (B6/B8) and the
 * attribute engine rules — against real PostgreSQL.
 */
class InventoryItemsIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private long createDef(String json) throws Exception {
        return idOf(postJson("/api/inventory/attribute-defs?bandId=7", json, "tok-admin")
                .andExpect(status().isCreated()));
    }

    private long createItem(String json) throws Exception {
        return idOf(postJson("/api/inventory/items?bandId=7", json, "tok-admin")
                .andExpect(status().isCreated()));
    }

    private static long idOf(ResultActions result) throws Exception {
        String body = result.andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    @Test
    void fullLifecycleCreateReadUpdateDelete() throws Exception {
        long sizeDefId = createDef("""
                {"name":"Rozmiar","itemType":"UNIFORM","dataType":"SELECT",
                 "displayOrder":1,"required":true,"options":["S","M","L"]}""");
        long yearDefId = createDef("""
                {"name":"Rok zakupu","itemType":"UNIFORM","dataType":"NUMBER","displayOrder":2}""");

        long itemId = createItem("""
                {"name":"Marynarka galowa","type":"UNIFORM","serialNumber":"UNI-001",
                 "attributes":[{"attributeDefId":%d,"value":"M"},{"attributeDefId":%d,"value":"2024"}]}"""
                .formatted(sizeDefId, yearDefId))
                ;

        mvc.perform(get("/api/inventory/items/{id}", itemId).with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Marynarka galowa"))
                .andExpect(jsonPath("$.type").value("UNIFORM"))
                .andExpect(jsonPath("$.lifecycleStatus").value("AVAILABLE"))
                .andExpect(jsonPath("$.warehouse").value("MAIN"))
                .andExpect(jsonPath("$.serialNumber").value("UNI-001"))
                .andExpect(jsonPath("$.attributes", org.hamcrest.Matchers.hasSize(2)))
                .andExpect(jsonPath("$.attributes[0].value").value("M"));

        // Update: replace name + attribute values wholesale. The program-assigned
        // code survives — it is never an edit surface (roadmap 2026-10-20, zad. 2).
        mvc.perform(put("/api/inventory/items/{id}", itemId)
                        .contentType("application/json")
                        .content("""
                                {"name":"Marynarka wizytowa","warehouse":"MAIN",
                                 "attributes":[{"attributeDefId":%d,"value":"L"}]}"""
                                .formatted(sizeDefId))
                        .with(as("tok-admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Marynarka wizytowa"))
                .andExpect(jsonPath("$.warehouse").value("MAIN"))
                .andExpect(jsonPath("$.serialNumber").value("UNI-001"))
                .andExpect(jsonPath("$.attributes", org.hamcrest.Matchers.hasSize(1)));

        // Warehouse changes go through the transfer endpoint (B6: history = fact).
        postJson("/api/inventory/items/" + itemId + "/transfers", """
                {"to":"ARCHIVE","note":"koniec sezonu"}""", "tok-admin")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.warehouse").value("ARCHIVE"));

        // Transfer wrote history — such an item is no longer deletable (evidence base).
        mvc.perform(delete("/api/inventory/items/{id}", itemId).with(as("tok-admin")))
                .andExpect(status().isConflict());
        mvc.perform(get("/api/inventory/items/{id}", itemId).with(as("tok-member")))
                .andExpect(status().isOk());
    }

    @Test
    void memberCannotWriteButCanRead() throws Exception {
        long itemId = createItem("""
                {"name":"Puzon","type":"INSTRUMENT","serialNumber":"TB-9"}""");

        mvc.perform(get("/api/inventory/items?bandId=7").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].serialNumber").value("TB-9"));

        postJson("/api/inventory/items?bandId=7", "{\"name\":\"Nowy\",\"type\":\"OTHER\"}", "tok-member")
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/inventory/items/{id}", itemId)
                        .contentType("application/json")
                        .content("{\"name\":\"Zmiana\"}")
                        .with(as("tok-member")))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/inventory/items/{id}", itemId).with(as("tok-member")))
                .andExpect(status().isForbidden());
    }

    @Test
    void foreignBandUserGetsForbidden_unknownIdNotFound() throws Exception {
        mvc.perform(get("/api/inventory/items?bandId=7").with(as("tok-outsider")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/inventory/items/{id}", 424242).with(as("tok-admin")))
                .andExpect(status().isNotFound());
    }

    @Test
    void attributeValidationRules() throws Exception {
        long numberDef = createDef("""
                {"name":"Liczba trąbek","itemType":"EQUIPMENT","dataType":"NUMBER"}""");
        long uniformDef = createDef("""
                {"name":"Rozmiar","itemType":"UNIFORM","dataType":"SELECT","options":["M"]}""");

        // Wrong number format -> 400 with the domain message.
        postJson("/api/inventory/items?bandId=7", """
                {"name":"Skrzynia","type":"EQUIPMENT",
                 "attributes":[{"attributeDefId":%d,"value":"dużo"}]}""".formatted(numberDef))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"));

        // Definition of another type -> rejected like a foreign one (400, no probing).
        postJson("/api/inventory/items?bandId=7", """
                {"name":"Skrzynia","type":"EQUIPMENT",
                 "attributes":[{"attributeDefId":%d,"value":"M"}]}""".formatted(uniformDef))
                .andExpect(status().isBadRequest());

        // Unknown definition id -> 400 (not 404: keeps band scoping silent).
        postJson("/api/inventory/items?bandId=7", """
                {"name":"Skrzynia","type":"EQUIPMENT",
                 "attributes":[{"attributeDefId":999999,"value":"1"}]}""")
                .andExpect(status().isBadRequest());
    }

    @Test
    void requiredAttributeMustBeSuppliedOnCreate() throws Exception {
        createDef("""
                {"name":"Rozmiar","itemType":"UNIFORM","dataType":"SELECT",
                 "required":true,"options":["M"]}""");
        postJson("/api/inventory/items?bandId=7",
                "{\"name\":\"Buty\",\"type\":\"UNIFORM\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("wymagany")));
    }

    @Test
    void serialNumberUniquePerBand() throws Exception {
        createItem("{\"name\":\"A\",\"type\":\"OTHER\",\"serialNumber\":\"SN-1\"}");
        postJson("/api/inventory/items?bandId=7",
                "{\"name\":\"B\",\"type\":\"OTHER\",\"serialNumber\":\"SN-1\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("zajęty")));
    }

    @Test
    void autoCodeIsAssignedPerTypeAndIncrementsWithinBand() throws Exception {
        long firstInstrument = createItem("{\"name\":\"Trąbka\",\"type\":\"INSTRUMENT\"}");
        long secondInstrument = createItem("{\"name\":\"Puzon\",\"type\":\"INSTRUMENT\"}");
        long uniform = createItem("{\"name\":\"Spornia\",\"type\":\"UNIFORM\"}");

        codeMatches(firstInstrument, "INS-\\d{4}");
        codeMatches(secondInstrument, "INS-\\d{4}");
        codeMatches(uniform, "UNI-\\d{4}");

        // Each add bumps the per-(band,type) counter: codes within a type are unique.
        assertThat(codeOf(firstInstrument)).isNotEqualTo(codeOf(secondInstrument));
    }

    private void codeMatches(long itemId, String pattern) throws Exception {
        assertThat(codeOf(itemId)).matches(pattern);
    }

    private String codeOf(long itemId) throws Exception {
        String body = mvc.perform(get("/api/inventory/items/{id}", itemId).with(as("tok-admin")))
                .andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("serialNumber").asText();
    }

    @Test
    void listFiltersByTypeWarehouseAndSearch() throws Exception {
        createItem("{\"name\":\"Flet\",\"type\":\"INSTRUMENT\",\"serialNumber\":\"F-1\",\"warehouse\":\"MAIN\"}");
        createItem("{\"name\":\"Kapelusz\",\"type\":\"UNIFORM\",\"serialNumber\":\"K-9\","
                + "\"warehouse\":\"SERVICE\"}");

        mvc.perform(get("/api/inventory/items?bandId=7&type=INSTRUMENT").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Flet"));

        mvc.perform(get("/api/inventory/items?bandId=7&warehouse=SERVICE").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Kapelusz"));

        mvc.perform(get("/api/inventory/items?bandId=7&search=f-1").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].serialNumber").value("F-1"));

        mvc.perform(get("/api/inventory/items?bandId=7&search=FLET").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Flet"));
    }

    @Test
    void listFiltersByAttributeDefinitionAndValue() throws Exception {
        // P0 §3.1: lists filterable by attribute per definition from the list.
        long colorDef = createDef("""
                {"name":"Kolor","itemType":"UNIFORM","dataType":"TEXT","displayOrder":1}""");
        long sizeDef = createDef("""
                {"name":"Rozmiar","itemType":"UNIFORM","dataType":"SELECT",
                 "displayOrder":2,"options":["S","M"]}""");
        createItem("""
                {"name":"Marynarka","type":"UNIFORM","attributes":[
                 {"attributeDefId":%d,"value":"Zielony"},{"attributeDefId":%d,"value":"M"}]}"""
                .formatted(colorDef, sizeDef));
        createItem("""
                {"name":"Spornia","type":"UNIFORM","attributes":[
                 {"attributeDefId":%d,"value":"Czarny"},{"attributeDefId":%d,"value":"S"}]}"""
                .formatted(colorDef, sizeDef));
        createItem("{\"name\":\"Pulpit\",\"type\":\"EQUIPMENT\"}");

        // Exact value match is case-insensitive (SELECT chips arrive verbatim, TEXT is typed).
        mvc.perform(get("/api/inventory/items?bandId=7&attributeDefId=" + colorDef
                + "&attributeValue=zielony").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Marynarka"));

        // Definition without value = "has any value set for this attribute".
        mvc.perform(get("/api/inventory/items?bandId=7&attributeDefId=" + sizeDef).with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(2)));

        // Combines with the classic filters (type narrows within the attribute hit).
        mvc.perform(get("/api/inventory/items?bandId=7&type=INSTRUMENT&attributeDefId=" + colorDef)
                        .with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(0)));

        // A value without a definition is meaningless (values are per-def) -> 400.
        mvc.perform(get("/api/inventory/items?bandId=7&attributeValue=M").with(as("tok-member")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"));

        // Foreign band's definition yields an empty page, never another band's data.
        mvc.perform(get("/api/inventory/items?bandId=7&attributeDefId=999999").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(0)));
    }

    @Test
    void listRowsCarryValuesOfDisplayInListAttributes() throws Exception {
        // B16: flaga displayInList decyduje, które wartości jadą na wiersz listy,
        // w kolejności displayOrder, tylko aktywne definicje tego typu pozycji.
        long colorDef = createDef("""
                {"name":"Kolor","itemType":"UNIFORM","dataType":"TEXT","displayOrder":1}""");
        long typeDef = createDef("""
                {"name":"Typ","itemType":"UNIFORM","dataType":"SELECT",
                 "displayOrder":2,"options":["Mundur","Garnitur"],"displayInList":true}""");
        long sizeDef = createDef("""
                {"name":"Rozmiar","itemType":"UNIFORM","dataType":"SELECT",
                 "displayOrder":3,"options":["S","M"],"displayInList":true}""");
        long marynarkaId = createItem("""
                {"name":"Marynarka","type":"UNIFORM","attributes":[
                 {"attributeDefId":%d,"value":"Zielony"},
                 {"attributeDefId":%d,"value":"Mundur"},
                 {"attributeDefId":%d,"value":"M"}]}"""
                .formatted(colorDef, typeDef, sizeDef));
        long spodnieId = createItem("""
                {"name":"Spodnie","type":"UNIFORM","attributes":[
                 {"attributeDefId":%d,"value":"Garnitur"}]}""".formatted(typeDef));
        long fletId = createItem("{\"name\":\"Flet\",\"type\":\"INSTRUMENT\"}");

        var rows = listRows();
        var marynarka = rowOf(rows, marynarkaId);
        assertThat(marynarka.get("listAttributes")).hasSize(2);
        assertThat(marynarka.get("listAttributes").get(0).get("attributeDefId").asLong()).isEqualTo(typeDef);
        assertThat(marynarka.get("listAttributes").get(0).get("name").asText()).isEqualTo("Typ");
        assertThat(marynarka.get("listAttributes").get(0).get("value").asText()).isEqualTo("Mundur");
        assertThat(marynarka.get("listAttributes").get(1).get("name").asText()).isEqualTo("Rozmiar");

        // Oznaczony, ale bez wartości u danej pozycji → nic nie dokłada wiersza.
        assertThat(rowOf(rows, spodnieId).get("listAttributes")).hasSize(1);
        // Inny typ pozycji = inna pula definicji; brak flagowanych → pusta lista.
        assertThat(rowOf(rows, fletId).get("listAttributes")).isEmpty();

        // Mechanizm jest dynamiczny: deaktywacja definicji natychmiast znosi ją z wierszy.
        mvc.perform(delete("/api/inventory/attribute-defs/{id}", typeDef).with(as("tok-admin")))
                .andExpect(status().isNoContent());
        var after = listRows();
        assertThat(rowOf(after, marynarkaId).get("listAttributes")).hasSize(1);
        assertThat(rowOf(after, marynarkaId).get("listAttributes").get(0).get("name").asText()).isEqualTo("Rozmiar");
        assertThat(rowOf(after, spodnieId).get("listAttributes")).isEmpty();
    }

    private com.fasterxml.jackson.databind.JsonNode listRows() throws Exception {
        return MAPPER.readTree(mvc.perform(get("/api/inventory/items?bandId=7").with(as("tok-member")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    private static com.fasterxml.jackson.databind.JsonNode rowOf(com.fasterxml.jackson.databind.JsonNode rows, long id) {
        for (var row : rows) {
            if (row.get("id").asLong() == id) {
                return row;
            }
        }
        throw new AssertionError("brak wiersza o id=" + id + " w odpowiedzi listy");
    }

    @Test
    void wmOutageSurfacesAsServiceUnavailable() throws Exception {
        willThrow(new WmUnavailableException("awaria testowa"))
                .given(bandDirectory).myBands("tok-admin");
        mvc.perform(get("/api/inventory/items?bandId=7").with(as("tok-admin")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("upstream_unavailable"));
    }

    @Test
    void blankNameIsOptionalAndCodeStillAssigned() throws Exception {
        // Roadmap 2026-10-20 (zad. 1): nazwa jest niewymagana — UI identyfikuje
        // pozycję typem + kodem, więc pustka przechodzi i kod się nadaje.
        long itemId = createItem("{\"name\":\" \",\"type\":\"OTHER\"}");
        mvc.perform(get("/api/inventory/items/{id}", itemId).with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.serialNumber").value(org.hamcrest.Matchers.matchesPattern("INN-\\d{4}")));
    }

    @Test
    void createWithoutAnyNameSucceeds() throws Exception {
        long itemId = createItem("{\"type\":\"INSTRUMENT\"}");
        mvc.perform(get("/api/inventory/items/{id}", itemId).with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.serialNumber").value(org.hamcrest.Matchers.matchesPattern("INS-\\d{4}")));
    }
}
