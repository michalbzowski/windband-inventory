package pl.michalbzowski.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * F5 stocktake over REST (analysis 3.2, B7/B8/B9): ADMIN start/close only,
 * any band member counts with an ACTIVE roster counter (B10), snapshot =
 * AVAILABLE/ASSIGNED items of the band narrowed by start filters, the
 * IN_PROGRESS editability window, EXTRA units, the 4-section summary,
 * double-close rejection and band-scoped authz.
 */
class StocktakesIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private long createItem(String name, String type) throws Exception {
        String body = postJson("/api/inventory/items?bandId=7",
                "{\"name\":\"" + name + "\",\"type\":\"" + type + "\"}")
                .andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    private long createInstrument(String name) throws Exception {
        return createItem(name, "INSTRUMENT");
    }

    private void assign(long itemId, long memberId) throws Exception {
        postJson("/api/inventory/items/" + itemId + "/assign",
                "{\"memberId\":" + memberId + "}", "tok-admin")
                .andExpect(status().isOk());
    }

    private ResultActions start(String json, String token) throws Exception {
        return postJson("/api/inventory/stocktakes?bandId=7", json, token);
    }

    private long startInstrumentStocktake(String json) throws Exception {
        String body = start(json, "tok-admin").andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    private long startAllStocktake() throws Exception {
        return startInstrumentStocktake("{}");
    }

    private Map<String, Long> lineIds(long stocktakeId) throws Exception {
        String body = mvc.perform(get("/api/inventory/stocktakes/{id}/lines", stocktakeId)
                        .with(as("tok-member")))
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        Map<String, Long> ids = new HashMap<>();
        MAPPER.readTree(body).forEach(line ->
                ids.put(line.get("name").asText(), line.get("id").longValue()));
        return ids;
    }

    private ResultActions count(long stocktakeId, long lineId, String json, String token)
            throws Exception {
        return mvc.perform(put("/api/inventory/stocktakes/{sid}/lines/{lid}", stocktakeId, lineId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json)
                .with(as(token)));
    }

    private ResultActions summary(long stocktakeId, String token) throws Exception {
        return mvc.perform(get("/api/inventory/stocktakes/{id}/summary", stocktakeId)
                .with(as(token)));
    }

    private ResultActions patchStocktake(long stocktakeId, String action, String token)
            throws Exception {
        return mvc.perform(patch("/api/inventory/stocktakes/{id}/{action}", stocktakeId, action)
                .with(as(token)));
    }

    @Test
    void fullFlowStartCountWithDivergencesCloseReport() throws Exception {
        createInstrument("Flet");
        createInstrument("Tuba");
        long saksofon = createInstrument("Saksofon");
        assign(saksofon, 11L);
        createItem("Marynarka", "UNIFORM");
        long marimba = createInstrument("Marimba");
        assign(marimba, 12L);
        postJson("/api/inventory/items/" + marimba + "/unassign", "{\"state\":\"LOST\"}", "tok-admin")
                .andExpect(status().isOk());

        long id = startAllStocktake();

        // Snapshot: 4 active instruments (LOST excluded), ASSIGNED carries assignee.
        Map<String, Long> lines = lineIds(id);
        org.hamcrest.MatcherAssert.assertThat(lines.keySet(), hasSize(4));
        JsonNode list = MAPPER.readTree(mvc.perform(get("/api/inventory/stocktakes/{id}/lines", id)
                        .with(as("tok-member")))
                .andReturn().getResponse().getContentAsString());
        JsonNode saksofonRow = null;
        for (JsonNode row : list) {
            if ("Saksofon".equals(row.get("name").asText())) {
                saksofonRow = row;
            }
        }
        org.junit.jupiter.api.Assertions.assertNotNull(saksofonRow);
        org.junit.jupiter.api.Assertions.assertEquals("ASSIGNED", saksofonRow.get("expectedStatus").asText());
        org.junit.jupiter.api.Assertions.assertEquals("Jan Kowalski", saksofonRow.get("assignedMemberName").asText());

        summary(id, "tok-member")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(4))
                .andExpect(jsonPath("$.counted").value(0))
                .andExpect(jsonPath("$.uncounted").value(4));

        // MEMBER counts, ACTIVE roster member only (B8/B10).
        count(id, lines.get("Flet"), "{\"foundState\":\"OK\",\"countedMemberId\":11}", "tok-member")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.foundState").value("OK"))
                .andExpect(jsonPath("$.countedByMemberName").value("Jan Kowalski"))
                .andExpect(jsonPath("$.countedAt").value(not(nullValue())));
        count(id, lines.get("Tuba"), "{\"foundState\":\"MISSING\",\"note\":\"brak w pokoju\",\"countedMemberId\":12}", "tok-member")
                .andExpect(status().isOk());
        count(id, lines.get("Saksofon"), "{\"foundState\":\"BROKEN\",\"countedMemberId\":11}", "tok-member")
                .andExpect(status().isOk());
        // Marynarka stays uncounted on purpose — closing with uncounted lines is allowed
        // and the counter stays visible in the summary.
        // EXTRA unit: the LOST marimba is physically found (Nadwyżka).
        mvc.perform(post("/api/inventory/stocktakes/{id}/lines", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"itemId\":" + marimba + ",\"countedMemberId\":12,\"note\":\"znaleziona na próbie\"}")
                        .with(as("tok-member")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.foundState").value("EXTRA"))
                .andExpect(jsonPath("$.extra").value(true))
                .andExpect(jsonPath("$.expectedStatus").value(nullValue()));

        summary(id, "tok-member")
                .andExpect(jsonPath("$.total").value(5))
                .andExpect(jsonPath("$.counted").value(4))
                .andExpect(jsonPath("$.uncounted").value(1))
                .andExpect(jsonPath("$.ok").value(1))
                .andExpect(jsonPath("$.missing").value(1))
                .andExpect(jsonPath("$.broken").value(1))
                .andExpect(jsonPath("$.extra").value(1))
                .andExpect(jsonPath("$.divergences").value(3));

        // Report sections (B9): Brakuje -> exactly the missing line.
        mvc.perform(get("/api/inventory/stocktakes/{id}/lines", id)
                        .param("state", "MISSING").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Tuba"))
                .andExpect(jsonPath("$[0].note").value("brak w pokoju"));

        patchStocktake(id, "close", "tok-admin")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLOSED"))
                .andExpect(jsonPath("$.finishedAt").value(not(nullValue())));

        count(id, lines.get("Flet"), "{\"foundState\":\"OK\",\"countedMemberId\":11}", "tok-member")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));
        patchStocktake(id, "close", "tok-admin")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("IN_PROGRESS")));
    }

    @Test
    void snapshotRespectsStartFiltersAndExcludesNonActiveItems() throws Exception {
        long flet = createInstrument("Flet prosty");
        createItem("Guzik", "CONSUMABLE");
        long tuba = createInstrument("Tuba kontrabasowa");
        postJson("/api/inventory/items/" + tuba + "/transfers", """
                {"to":"SERVICE"}""", "tok-admin").andExpect(status().isOk());

        long instruments = startInstrumentStocktake("{\"type\":\"INSTRUMENT\"}");
        org.hamcrest.MatcherAssert.assertThat(lineIds(instruments).keySet(), hasSize(2));
        patchStocktake(instruments, "close", "tok-admin").andExpect(status().isOk());

        long serviceWarehouse = startInstrumentStocktake("{\"warehouse\":\"SERVICE\"}");
        Map<String, Long> lines = lineIds(serviceWarehouse);
        org.hamcrest.MatcherAssert.assertThat(lines.keySet(), hasSize(1));
        org.junit.jupiter.api.Assertions.assertEquals("Tuba kontrabasowa", lines.keySet().iterator().next());
        patchStocktake(serviceWarehouse, "close", "tok-admin").andExpect(status().isOk());

        // IN_SERVICE via return-to-service is also excluded from snapshots.
        assign(flet, 11L);
        postJson("/api/inventory/items/" + flet + "/unassign", "{\"state\":\"IN_SERVICE\"}", "tok-admin")
                .andExpect(status().isOk());
        long afterService = startInstrumentStocktake("{\"type\":\"INSTRUMENT\"}");
        org.hamcrest.MatcherAssert.assertThat(lineIds(afterService).keySet(), hasSize(1));
    }

    @Test
    void pauseBlocksCountingAndIsAdminOnly() throws Exception {
        createInstrument("Klarnet");
        createInstrument("Fagot");
        long stocktake = startInstrumentStocktake("{}");
        Map<String, Long> lines = lineIds(stocktake);

        count(stocktake, lines.get("Klarnet"), "{\"foundState\":\"OK\",\"countedMemberId\":12}", "tok-member")
                .andExpect(status().isOk());

        patchStocktake(stocktake, "pause", "tok-member")
                .andExpect(status().isForbidden());
        patchStocktake(stocktake, "pause", "tok-admin")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));

        count(stocktake, lines.get("Fagot"), "{\"foundState\":\"OK\",\"countedMemberId\":12}", "tok-member")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));

        patchStocktake(stocktake, "resume", "tok-admin")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        count(stocktake, lines.get("Fagot"), "{\"foundState\":\"OK\",\"countedMemberId\":12}", "tok-member")
                .andExpect(status().isOk());

        patchStocktake(stocktake, "resume", "tok-admin")
                .andExpect(status().isConflict());
    }

    @Test
    void roleMatrixOnStocktakeEndpoints() throws Exception {
        createInstrument("Trombon");

        start("{\"notes\":\"x\"}", "tok-member")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("forbidden"));
        start("{\"notes\":\"x\"}", "tok-outsider")
                .andExpect(status().isForbidden());
        long stocktake = startInstrumentStocktake("{}");

        summary(stocktake, "tok-outsider").andExpect(status().isForbidden());
        summary(stocktake, "tok-band3admin").andExpect(status().isForbidden());
        patchStocktake(stocktake, "close", "tok-band3admin").andExpect(status().isForbidden());
        mvc.perform(get("/api/inventory/stocktakes").param("bandId", "7").with(as("tok-band3admin")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/inventory/stocktakes/{id}/summary", stocktake))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/api/inventory/stocktakes").param("bandId", "7").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(stocktake))
                .andExpect(jsonPath("$[0].startedBySubject").value("user"));
    }

    @Test
    void counterMustBeActiveMemberOfTheBand() throws Exception {
        createInstrument("Waltornia");
        long stocktake = startInstrumentStocktake("{}");
        long line = lineIds(stocktake).get("Waltornia");

        count(stocktake, line, "{\"foundState\":\"OK\",\"countedMemberId\":13}", "tok-member")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("nieaktywny")));
        count(stocktake, line, "{\"foundState\":\"OK\",\"countedMemberId\":999}", "tok-member")
                .andExpect(status().isBadRequest());
        count(stocktake, line, "{\"foundState\":\"OK\"}", "tok-member")
                .andExpect(status().isBadRequest());
    }

    @Test
    void recountOverwritesPreviousState() throws Exception {
        createInstrument("Pikolo");
        long stocktake = startInstrumentStocktake("{}");
        long line = lineIds(stocktake).get("Pikolo");

        count(stocktake, line, "{\"foundState\":\"MISSING\",\"countedMemberId\":11}", "tok-member")
                .andExpect(status().isOk());
        summary(stocktake, "tok-member").andExpect(jsonPath("$.missing").value(1));

        count(stocktake, line, "{\"foundState\":\"BROKEN\",\"note\":\"była ale stłuczona\",\"countedMemberId\":11}", "tok-member")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.foundState").value("BROKEN"));
        summary(stocktake, "tok-member")
                .andExpect(jsonPath("$.missing").value(0))
                .andExpect(jsonPath("$.broken").value(1))
                .andExpect(jsonPath("$.divergences").value(1));

        // EXTRA vocabulary cannot be assigned to a snapshot line via count.
        count(stocktake, line, "{\"foundState\":\"EXTRA\",\"countedMemberId\":11}", "tok-member")
                .andExpect(status().isBadRequest());
    }

    @Test
    void extraUnitRules() throws Exception {
        createInstrument("Tarn");
        long otherBand = MAPPER.readTree(postJson("/api/inventory/items?bandId=3",
                "{\"name\":\"Obój bandu 3\",\"type\":\"INSTRUMENT\"}", "tok-band3admin")
                .andReturn().getResponse().getContentAsString()).get("id").longValue();
        long lost = createInstrument("Dzwonki");
        assign(lost, 11L);
        postJson("/api/inventory/items/" + lost + "/unassign", "{\"state\":\"LOST\"}", "tok-admin")
                .andExpect(status().isOk());

        long stocktake = startInstrumentStocktake("{}");

        // Unknown item -> 404; foreign-band item -> 400; duplicate -> 400.
        mvc.perform(post("/api/inventory/stocktakes/{id}/lines", stocktake)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"itemId\":987654,\"countedMemberId\":11}")
                        .with(as("tok-member")))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/inventory/stocktakes/{id}/lines", stocktake)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"itemId\":" + otherBand + ",\"countedMemberId\":11}")
                        .with(as("tok-member")))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/inventory/stocktakes/{id}/lines", stocktake)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"itemId\":" + lost + ",\"countedMemberId\":11}")
                        .with(as("tok-member")))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/inventory/stocktakes/{id}/lines", stocktake)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"itemId\":" + lost + ",\"countedMemberId\":11}")
                        .with(as("tok-member")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("już")));

        // Same item cannot also be counted as a snapshot line twice — snapshot kept it out (LOST).
        org.hamcrest.MatcherAssert.assertThat(lineIds(stocktake).keySet(), hasSize(2));
        org.junit.jupiter.api.Assertions.assertTrue(lineIds(stocktake).containsKey("Tarn"));
    }

    @Test
    void unknownStocktakeAndForeignLineGiveNotFound() throws Exception {
        createInstrument("Kontra");
        long first = startInstrumentStocktake("{}");
        // single-open invariant: close before a second start in the same band
        patchStocktake(first, "close", "tok-admin").andExpect(status().isOk());

        patchStocktake(987654L, "close", "tok-admin").andExpect(status().isNotFound());
        summary(987654L, "tok-admin").andExpect(status().isNotFound());

        long stocktake = startInstrumentStocktake("{}");
        long line = lineIds(stocktake).get("Kontra");
        // Line belongs to the newest stocktake — the older one must not accept it.
        count(987654L, line, "{\"foundState\":\"OK\",\"countedMemberId\":11}", "tok-admin")
                .andExpect(status().isNotFound());
        count(stocktake, 987654L, "{\"foundState\":\"OK\",\"countedMemberId\":11}", "tok-admin")
                .andExpect(status().isNotFound());
        count(stocktake, line, "{\"foundState\":\"OK\",\"countedMemberId\":11}", "tok-admin")
                .andExpect(status().isOk());
    }

    @Test
    void secondStartWhileAnotherStocktakeIsOpenIsRejected() throws Exception {
        // The hub/join/report UX assumes ONE editable stocktake per band.
        createInstrument("Flet");
        startAllStocktake();

        start("{\"notes\":\"drugi na to samo\"}", "tok-admin")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));
    }

    @Test
    void emptyStocktakeIsClosable() throws Exception {
        long stocktake = startInstrumentStocktake("{\"type\":\"AWARD\"}");

        summary(stocktake, "tok-member")
                .andExpect(jsonPath("$.total").value(0))
                .andExpect(jsonPath("$.counted").value(0));
        patchStocktake(stocktake, "close", "tok-admin")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLOSED"));
    }
}
