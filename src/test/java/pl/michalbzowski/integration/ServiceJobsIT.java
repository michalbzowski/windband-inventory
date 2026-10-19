package pl.michalbzowski.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;

/**
 * Service board (decision B15): REQUESTED → SHIPPED → REPAIRED → READY_FOR_PICKUP
 * → IN_STOCK → HANDLED_OVER, with CANCELLED only from REQUESTED. Item effects are
 * asserted at every physical step: SHIPPED closes the assignment and moves the item
 * to IN_SERVICE/SERVICE; IN_STOCK returns it AVAILABLE/MAIN; HANDLED_OVER re-assigns
 * it to the reporter (active member again, B10). Writes ADMIN-only (B8); reads any member.
 */
class ServiceJobsIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private long createItem(String name) throws Exception {
        String body = postJson("/api/inventory/items?bandId=7",
                        "{\"name\":\"" + name + "\",\"type\":\"INSTRUMENT\",\"serialNumber\":\"SN-" + name + "\"}",
                        "tok-admin")
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return MAPPER.readTree(body).get("id").asLong();
    }

    private void assign(long itemId, long memberId) throws Exception {
        postJson("/api/inventory/items/" + itemId + "/assign", "{\"memberId\":" + memberId + "}", "tok-admin")
                .andExpect(status().isOk());
    }

    private JsonNode item(String name) throws Exception {
        String r = mvc.perform(get("/api/inventory/items").param("bandId", "7")
                        .header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        for (JsonNode node : MAPPER.readTree(r)) {
            if (name.equals(node.get("name").asText())) {
                return node;
            }
        }
        throw new AssertionError("pozycja „" + name + "” nie istnieje w rejestrze");
    }

    private long createJob(long itemId, Long reporterMemberId) throws Exception {
        String json = "{\"itemId\":" + itemId + ",\"note\":\"dudniony dźwięk\","
                + (reporterMemberId == null ? "" : "\"reporterMemberId\":" + reporterMemberId + ",")
                + "\"createdMemberId\":11}";
        return MAPPER.readTree(postJson("/api/inventory/service-jobs?bandId=7", json, "tok-admin")
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).get("id").asLong();
    }

    private JsonNode job(long id) throws Exception {
        String r = mvc.perform(get("/api/inventory/service-jobs/" + id)
                        .header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return MAPPER.readTree(r);
    }

    private void setStatus(long jobId, String statusName, String token) throws Exception {
        postJson("/api/inventory/service-jobs/" + jobId + "/status", "{\"status\":\"" + statusName + "\"}", token)
                .andExpect(status().isOk());
    }

    @Test
    void fullFlow_forAssignedItem_reportsShipsBackAndHandsOver() throws Exception {
        String name = "Tuba serwisowa A1";
        long itemId = createItem(name);
        assign(itemId, 12);

        // REQUESTED — the item must not move yet (it is still out with the member).
        long jobId = createJob(itemId, 12L);
        assertEquals("REQUESTED", job(jobId).get("status").asText());
        JsonNode it = item(name);
        assertEquals("ASSIGNED", it.get("lifecycleStatus").asText());
        assertEquals(12L, it.get("assignedMemberId").asLong());

        // SHIPPED — assignment closed, journey evidence opened, item IN_SERVICE / SERVICE.
        setStatus(jobId, "SHIPPED", "tok-admin");
        it = item(name);
        assertEquals("IN_SERVICE", it.get("lifecycleStatus").asText());
        assertEquals("SERVICE", it.get("warehouse").asText());
        assertTrue(it.get("assignedMemberId").isNull());

        // REPAIRED + READY_FOR_PICKUP — informational; the item stays outside the band.
        setStatus(jobId, "REPAIRED", "tok-admin");
        it = item(name);
        assertEquals("IN_SERVICE", it.get("lifecycleStatus").asText());
        assertEquals("SERVICE", it.get("warehouse").asText());
        setStatus(jobId, "READY_FOR_PICKUP", "tok-admin");

        // IN_STOCK — physical return: AVAILABLE again, back to MAIN.
        setStatus(jobId, "IN_STOCK", "tok-admin");
        it = item(name);
        assertEquals("AVAILABLE", it.get("lifecycleStatus").asText());
        assertEquals("MAIN", it.get("warehouse").asText());

        // HANDLED_OVER — terminal; the item is re-assigned to the reporter (active check again, B10).
        setStatus(jobId, "HANDLED_OVER", "tok-admin");
        it = item(name);
        assertEquals("ASSIGNED", it.get("lifecycleStatus").asText());
        assertEquals(12L, it.get("assignedMemberId").asLong());
        JsonNode j = job(jobId);
        assertEquals("HANDLED_OVER", j.get("status").asText());
        assertTrue(!j.get("handedOverAt").isNull());
    }

    @Test
    void fullFlow_forAvailableItem_withoutReporter_rejectsHandOver() throws Exception {
        String name = "Saksofon serwisowy B2";
        long itemId = createItem(name);
        // No reporter — a band-level repair; the flow must physically work but cannot end in HANDLED_OVER.
        long jobId = createJob(itemId, null);
        assertEquals("REQUESTED", job(jobId).get("status").asText());

        setStatus(jobId, "SHIPPED", "tok-admin");
        JsonNode it = item(name);
        assertEquals("IN_SERVICE", it.get("lifecycleStatus").asText());
        assertEquals("SERVICE", it.get("warehouse").asText());
        setStatus(jobId, "REPAIRED", "tok-admin");
        setStatus(jobId, "READY_FOR_PICKUP", "tok-admin");
        setStatus(jobId, "IN_STOCK", "tok-admin");
        it = item(name);
        assertEquals("AVAILABLE", it.get("lifecycleStatus").asText());
        assertEquals("MAIN", it.get("warehouse").asText());

        postJson("/api/inventory/service-jobs/" + jobId + "/status", "{\"status\":\"HANDLED_OVER\"}", "tok-admin")
                .andExpect(status().isConflict());
    }

    @Test
    void cancel_onlyFromRequested_isTerminal() throws Exception {
        String name = "Obój serwisowy C3";
        long itemId = createItem(name);
        long jobId = createJob(itemId, 11L);

        setStatus(jobId, "CANCELLED", "tok-admin");
        JsonNode j = job(jobId);
        assertEquals("CANCELLED", j.get("status").asText());
        assertTrue(!j.get("cancelledAt").isNull());

        JsonNode it = item(name);
        assertEquals("AVAILABLE", it.get("lifecycleStatus").asText());
        assertEquals("MAIN", it.get("warehouse").asText());

        // A terminal row must not accept further transitions, but the item is free for a new request again.
        postJson("/api/inventory/service-jobs/" + jobId + "/status", "{\"status\":\"SHIPPED\"}", "tok-admin")
                .andExpect(status().isConflict());
        long second = createJob(itemId, 12L);
        assertEquals("REQUESTED", job(second).get("status").asText());
    }

    @Test
    void cancel_afterShippedMustFollowPhysicalWayBack() throws Exception {
        String name = "Waltornia serwisowa D4";
        long itemId = createItem(name);
        long jobId = createJob(itemId, 12L);
        setStatus(jobId, "SHIPPED", "tok-admin");

        postJson("/api/inventory/service-jobs/" + jobId + "/status", "{\"status\":\"CANCELLED\"}", "tok-admin")
                .andExpect(status().isConflict());
        assertEquals("SHIPPED", job(jobId).get("status").asText());
    }

    @Test
    void secondOpenJob_onSameItem_rejected() throws Exception {
        long itemId = createItem("Kontrabas serwisowy E5");
        long first = createJob(itemId, 12L);
        assertEquals("REQUESTED", job(first).get("status").asText());

        postJson("/api/inventory/service-jobs?bandId=7",
                "{\"itemId\":" + itemId + ",\"createdMemberId\":11}", "tok-admin")
                .andExpect(status().isConflict());
    }

    @Test
    void invalidTransitions_areConflict() throws Exception {
        long itemId = createItem("Fagot serwisowy F6");
        long jobId = createJob(itemId, 11L);

        // REQUESTED cannot jump over SHIPPED nor end directly in HANDLED_OVER.
        postJson("/api/inventory/service-jobs/" + jobId + "/status", "{\"status\":\"REPAIRED\"}", "tok-admin")
                .andExpect(status().isConflict());
        postJson("/api/inventory/service-jobs/" + jobId + "/status", "{\"status\":\"HANDLED_OVER\"}", "tok-admin")
                .andExpect(status().isConflict());
    }

    @Test
    void createRejectsInactiveReporter_andMemberWritesForbid() throws Exception {
        long itemId = createItem("Pianino serwisowe G7");

        // B10: the live WM roster says 13 (Stefan Stary) is inactive → the snapshot would lie.
        postJson("/api/inventory/service-jobs?bandId=7",
                "{\"itemId\":" + itemId + ",\"reporterMemberId\":13,\"createdMemberId\":11}", "tok-admin")
                .andExpect(status().isBadRequest());

        // B8: a band member reads fine but cannot write the board.
        String list = mvc.perform(get("/api/inventory/service-jobs").param("bandId", "7")
                        .header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        MAPPER.readTree(list);
        postJson("/api/inventory/service-jobs?bandId=7",
                "{\"itemId\":" + itemId + ",\"createdMemberId\":12}", "tok-member")
                .andExpect(status().isForbidden());
        long jobId = createJob(itemId, 12L);
        postJson("/api/inventory/service-jobs/" + jobId + "/status", "{\"status\":\"SHIPPED\"}", "tok-member")
                .andExpect(status().isForbidden());
    }

    // ----------------------------- tiny assertion helpers (no JUnit import churn)

    @Test
    void unknownJobAndListFilterWork() throws Exception {
        long itemId = createItem("Trombita serwisowa H8");
        long jobId = createJob(itemId, 11L);
        setStatus(jobId, "SHIPPED", "tok-admin");

        // status filter narrows the band list.
        String filtered = mvc.perform(get("/api/inventory/service-jobs")
                        .param("bandId", "7").param("status", "SHIPPED")
                        .header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        JsonNode[] arr = MAPPER.readValue(filtered, JsonNode[].class);
        assertEquals(1, arr.length);
        assertEquals(String.valueOf(jobId), arr[0].get("id").asText());

        // unknown job id → 404 for reads as well.
        mvc.perform(get("/api/inventory/service-jobs/9999").header("Authorization", "Bearer tok-member"))
                .andExpect(status().isNotFound());
    }

    private static void assertEquals(Object expected, Object actual) {
        if (!java.util.Objects.equals(expected, actual)) {
            throw new AssertionError("expected <" + expected + "> but was <" + actual + ">");
        }
    }

    private static void assertTrue(boolean condition) {
        if (!condition) {
            throw new AssertionError("condition failed");
        }
    }
}
