package pl.michalbzowski.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * Purchases (roadmap 2026-10-19): REQUESTED → SENT → IN_PROGRESS → DELIVERED →
 * READY_FOR_PICKUP → RECEIVED (+ CANCELLED before delivery). DELIVERED must
 * materialise a warehouse item (MAIN, AVAILABLE, unassigned); RECEIVED must
 * assign it to the snapshot member and open the assignment history. Writes are
 * ADMIN-only (B8), reads every band member; names are roster-snapshotted (B10).
 */
class PurchaseWorkflowIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private long createPurchase(String json, String token) throws Exception {
        String body = postJson("/api/inventory/purchases?bandId=7", json, token)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return MAPPER.readTree(body).get("id").longValue();
    }

    private long createPurchase(String json) throws Exception {
        return createPurchase(json, "tok-admin");
    }

    private static String body(String name, String type, long forMember) {
        return "{\"name\":\"" + name + "\",\"itemType\":\"" + type
                + "\",\"requestedForMemberId\":" + forMember + ",\"createdMemberId\":11}";
    }

    private JsonNode purchase(long id) throws Exception {
        String r = mvc.perform(get("/api/inventory/purchases/" + id)
                        .header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return MAPPER.readTree(r);
    }

    private JsonNode findItem(long bandId, String name) throws Exception {
        String r = mvc.perform(get("/api/inventory/items").param("bandId", String.valueOf(bandId))
                        .header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        for (JsonNode node : MAPPER.readTree(r)) {
            if (name.equals(node.get("name").asText())) {
                return node;
            }
        }
        throw new AssertionError("pozycja „" + name + "” nie trafiła do rejestru");
    }

    @Test
    void happyPathCreatesItemOnDeliveryAndAssignsOnReceipt() throws Exception {
        long id = createPurchase(body("Trabka Yamaha X", "INSTRUMENT", 12));

        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"SENT\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SENT"));
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"IN_PROGRESS\"}")
                .andExpect(status().isOk());
        postJson("/api/inventory/purchases/" + id + "/status",
                        "{\"status\":\"DELIVERED\",\"note\":\"kurier DHL, paczka 2/3\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DELIVERED"))
                .andExpect(jsonPath("$.itemId").isNumber())
                .andExpect(jsonPath("$.deliveredAt").isNotEmpty());

        // side effect 1: the item lives in the warehouse, unassigned
        long itemId = purchase(id).get("itemId").longValue();
        JsonNode item = findItem(7, "Trabka Yamaha X");
        org.junit.jupiter.api.Assertions.assertEquals(itemId, item.get("id").longValue());
        org.junit.jupiter.api.Assertions.assertEquals("AVAILABLE", item.get("lifecycleStatus").asText());
        org.junit.jupiter.api.Assertions.assertEquals("MAIN", item.get("warehouse").asText());
        org.junit.jupiter.api.Assertions.assertTrue(item.get("assignedMemberName").isNull());

        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"READY_FOR_PICKUP\"}")
                .andExpect(status().isOk());
        postJson("/api/inventory/purchases/" + id + "/status",
                        "{\"status\":\"RECEIVED\",\"note\":\"wydano osobiscie\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RECEIVED"))
                .andExpect(jsonPath("$.receivedAt").isNotEmpty())
                .andExpect(jsonPath("$.resolutionNote").value("wydano osobiscie"));

        // side effect 2: assigned to the snapshot member
        JsonNode after = findItem(7, "Trabka Yamaha X");
        org.junit.jupiter.api.Assertions.assertEquals("ASSIGNED", after.get("lifecycleStatus").asText());
        org.junit.jupiter.api.Assertions.assertEquals("Anna Nowak", after.get("assignedMemberName").asText());
    }

    @Test
    void namesAreSnapshottedFromRoster() throws Exception {
        long id = createPurchase(body("Futeral na puzon", "EQUIPMENT", 11));
        JsonNode p = purchase(id);
        org.junit.jupiter.api.Assertions.assertEquals("Jan Kowalski", p.get("requestedForName").asText());
        org.junit.jupiter.api.Assertions.assertEquals("Jan Kowalski", p.get("createdMemberName").asText());
        org.junit.jupiter.api.Assertions.assertEquals("REQUESTED", p.get("status").asText());
    }

    @Test
    void transitionsMustWalkInOrder() throws Exception {
        long id = createPurchase(body("Koszula koncertowa", "UNIFORM", 12));
        // skip SENT
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"IN_PROGRESS\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));
        // straight to RECEIVED
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"RECEIVED\"}")
                .andExpect(status().isConflict());
        // rewind is not evidence-friendly
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"SENT\"}")
                .andExpect(status().isOk());
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"REQUESTED\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"));
    }

    @Test
    void cancelAllowedOnlyBeforeDelivery() throws Exception {
        long id = createPurchase(body("Stojak na nuty", "EQUIPMENT", 12));
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"SENT\"}").andExpect(status().isOk());
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"CANCELLED\",\"note\":\"anulowalem u sprzedawcy\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"SENT\"}")
                .andExpect(status().isConflict());

        long delivered = createPurchase(body("Tlumik do trabki", "EQUIPMENT", 12));
        postJson("/api/inventory/purchases/" + delivered + "/status", "{\"status\":\"SENT\"}");
        postJson("/api/inventory/purchases/" + delivered + "/status", "{\"status\":\"IN_PROGRESS\"}");
        postJson("/api/inventory/purchases/" + delivered + "/status", "{\"status\":\"DELIVERED\"}")
                .andExpect(status().isOk());
        postJson("/api/inventory/purchases/" + delivered + "/status", "{\"status\":\"CANCELLED\"}")
                .andExpect(status().isConflict());
    }

    @Test
    void deliveredItemCannotBeDeletedPurchaseIsHistory() throws Exception {
        long id = createPurchase(body("Pulpit metalowy", "EQUIPMENT", 12));
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"SENT\"}");
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"IN_PROGRESS\"}");
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"DELIVERED\"}");
        long itemId = purchase(id).get("itemId").longValue();
        mvc.perform(delete("/api/inventory/items/" + itemId).header("Authorization", "Bearer tok-admin"))
                .andExpect(status().isConflict());
    }

    @Test
    void writesAreAdminOnlyAndTargetMustBeActiveRosterMember() throws Exception {
        long id = createPurchase(body("Nuty Marsz", "SHEET_MUSIC", 12));
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"SENT\"}", "tok-member")
                .andExpect(status().isForbidden());
        // inactive 13 / foreign 21 cannot be the recipient
        createPurchaseFail(body("Beczka", "EQUIPMENT", 13));
        createPurchaseFail(body("Beczka2", "EQUIPMENT", 21));
    }

    private void createPurchaseFail(String json) throws Exception {
        postJson("/api/inventory/purchases?bandId=7", json)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"));
    }

    // --- Atrybuty zamówienia: ten sam model danych co formularz „Nowa pozycja" (v2.x) ----

    private long def(String json) throws Exception {
        String body = postJson("/api/inventory/attribute-defs?bandId=7", json, "tok-admin")
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return MAPPER.readTree(body).get("id").asLong();
    }

    /** Scenariusz z zalecenia: UMundurowanie → typ (Mundur|Koszula), Wzrost wymagany,
     *  Szerokość ramion tylko dla Munduru, Rozmiar kołnierzyka tylko dla Koszuli. */
    private long[] uniformAttrs(String s) throws Exception {
        long typ = def("{\"name\":\"Typ " + s + "\",\"itemType\":\"UNIFORM\",\"dataType\":\"SELECT\","
                + "\"required\":true,\"options\":[\"Mundur\",\"Koszula\"],\"displayOrder\":1}");
        long wzrost = def("{\"name\":\"Wzrost " + s + "\",\"itemType\":\"UNIFORM\",\"dataType\":\"NUMBER\","
                + "\"required\":true,\"displayOrder\":2}");
        long ramiona = def(String.format(
                "{\"name\":\"Szerokość ramion %s\",\"itemType\":\"UNIFORM\",\"dataType\":\"NUMBER\","
                        + "\"dependsOnDefId\":%d,\"dependsOnValues\":[\"Mundur\"],\"displayOrder\":3}", s, typ));
        long kolnierz = def(String.format(
                "{\"name\":\"Rozmiar kołnierzyka %s\",\"itemType\":\"UNIFORM\",\"dataType\":\"NUMBER\","
                        + "\"dependsOnDefId\":%d,\"dependsOnValues\":[\"Koszula\"],\"displayOrder\":4}", s, typ));
        return new long[] {typ, wzrost, ramiona, kolnierz};
    }

    private String attrPair(long defId, String value) {
        return "{\"attributeDefId\":" + defId + ",\"value\":\"" + value + "\"}";
    }

    private long createPurchaseWith(String bodyJson) throws Exception {
        String body = postJson("/api/inventory/purchases?bandId=7", bodyJson)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return MAPPER.readTree(body).get("id").asLong();
    }

    private JsonNode itemAttrs(long itemId) throws Exception {
        String body = mvc.perform(get("/api/inventory/items/{id}", itemId)
                        .header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return MAPPER.readTree(body).get("attributes");
    }

    private java.util.List<String> attrNamesValues(JsonNode attrsArray) {
        java.util.List<String> seen = new java.util.ArrayList<>();
        for (JsonNode attr : attrsArray) {
            seen.add(attr.get("name").asText() + "=" + attr.get("value").asText());
        }
        return seen;
    }

    @Test
    void orderCapturesConditionalAttributesAndDeliversItemWithThem() throws Exception {
        String s = Long.toHexString(System.nanoTime());
        long[] a = uniformAttrs(s);
        // Gałąź Koszula (kołnierz) jest ukryta dla typu=Mundur → pomijana w ciszy, jak w formularzu.
        long id = createPurchaseWith("{\"name\":\"Mundur paradny\",\"itemType\":\"UNIFORM\","
                + "\"requestedForMemberId\":12,\"createdMemberId\":11,\"attributes\":["
                + attrPair(a[0], "Mundur") + "," + attrPair(a[1], "180") + ","
                + attrPair(a[2], "45") + "," + attrPair(a[3], "39") + "]}");

        JsonNode attrs = purchase(id).get("attributes");
        org.junit.jupiter.api.Assertions.assertEquals(3, attrs.size());
        java.util.List<String> accepted = attrNamesValues(attrs);
        org.junit.jupiter.api.Assertions.assertTrue(accepted.contains("Typ " + s + "=Mundur"));
        org.junit.jupiter.api.Assertions.assertTrue(accepted.contains("Wzrost " + s + "=180"));
        org.junit.jupiter.api.Assertions.assertTrue(accepted.contains("Szerokość ramion " + s + "=45"));

        // SENT → IN_PROGRESS → DELIVERED spiną snapshot z nowopowstałym itemem.
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"SENT\"}");
        postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"IN_PROGRESS\"}");
        String delivered = postJson("/api/inventory/purchases/" + id + "/status", "{\"status\":\"DELIVERED\"}")
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        long itemId = MAPPER.readTree(delivered).get("itemId").asLong();

        java.util.List<String> onItem = attrNamesValues(itemAttrs(itemId));
        org.junit.jupiter.api.Assertions.assertEquals(3, onItem.size());
        org.junit.jupiter.api.Assertions.assertTrue(onItem.containsAll(accepted));
    }

    @Test
    void orderRejectsMissingRequiredAttribute() throws Exception {
        String s = Long.toHexString(System.nanoTime()) + "m";
        long[] a = uniformAttrs(s);
        // typ=Mundur bez wymaganego Wzrostu → 400, dokładnie jak w „Nowej pozycji".
        postJson("/api/inventory/purchases?bandId=7", "{\"name\":\"Mundur\",\"itemType\":\"UNIFORM\","
                        + "\"requestedForMemberId\":12,\"createdMemberId\":11,\"attributes\":["
                        + attrPair(a[0], "Mundur") + "]}")
                .andExpect(status().isBadRequest());
    }

    @Test
    void orderRejectsAttributeOfOtherItemType() throws Exception {
        String s = Long.toHexString(System.nanoTime()) + "i";
        long[] a = uniformAttrs(s);
        long gniazdo = def("{\"name\":\"Gniazdo " + s + "\",\"itemType\":\"INSTRUMENT\",\"dataType\":\"NUMBER\","
                + "\"displayOrder\":9}");
        postJson("/api/inventory/purchases?bandId=7", "{\"name\":\"Mundur\",\"itemType\":\"UNIFORM\","
                        + "\"requestedForMemberId\":12,\"createdMemberId\":11,\"attributes\":["
                        + attrPair(a[0], "Mundur") + "," + attrPair(a[1], "180") + ","
                        + attrPair(gniazdo, "6.3") + "]}")
                .andExpect(status().isBadRequest());
    }

    @Test
    void validationStatusFilterAndMemberRead() throws Exception {
        postJson("/api/inventory/purchases?bandId=7", "{\"name\":\"\",\"itemType\":\"EQUIPMENT\","
                        + "\"requestedForMemberId\":12,\"createdMemberId\":11}")
                .andExpect(status().isBadRequest());
        postJson("/api/inventory/purchases?bandId=7", "{\"name\":\"X\",\"requestedForMemberId\":12,\"createdMemberId\":11}")
                .andExpect(status().isBadRequest());

        long a = createPurchase(body("Pasek A", "UNIFORM", 12));
        long b = createPurchase(body("Pasek B", "UNIFORM", 12));
        postJson("/api/inventory/purchases/" + a + "/status", "{\"status\":\"SENT\"}");
        String list = mvc.perform(get("/api/inventory/purchases").param("bandId", "7")
                        .param("status", "SENT")
                        .header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        JsonNode rows = MAPPER.readTree(list);
        org.junit.jupiter.api.Assertions.assertEquals(1, rows.size());
        org.junit.jupiter.api.Assertions.assertEquals(a, rows.get(0).get("id").longValue());
        org.junit.jupiter.api.Assertions.assertTrue(b > 0);
    }
}
