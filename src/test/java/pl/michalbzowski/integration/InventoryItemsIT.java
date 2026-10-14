package pl.michalbzowski.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

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

        // Update: replace name + attribute values wholesale.
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
    void wmOutageSurfacesAsServiceUnavailable() throws Exception {
        willThrow(new WmUnavailableException("awaria testowa"))
                .given(bandDirectory).myBands("tok-admin");
        mvc.perform(get("/api/inventory/items?bandId=7").with(as("tok-admin")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("upstream_unavailable"));
    }

    @Test
    void createRejectsBlankNameByBeanValidation() throws Exception {
        postJson("/api/inventory/items?bandId=7", "{\"name\":\" \",\"type\":\"OTHER\"}", "tok-admin")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"));
    }
}
