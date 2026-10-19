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
                .andReturn().getResponse().getContentAsString();
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
                .andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(r);
    }

    private JsonNode findItem(long bandId, String name) throws Exception {
        String r = mvc.perform(get("/api/inventory/items").param("bandId", String.valueOf(bandId))
                        .header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
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
                .andReturn().getResponse().getContentAsString();
        JsonNode rows = MAPPER.readTree(list);
        org.junit.jupiter.api.Assertions.assertEquals(1, rows.size());
        org.junit.jupiter.api.Assertions.assertEquals(a, rows.get(0).get("id").longValue());
        org.junit.jupiter.api.Assertions.assertTrue(b > 0);
    }
}
