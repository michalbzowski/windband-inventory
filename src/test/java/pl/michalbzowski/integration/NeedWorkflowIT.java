package pl.michalbzowski.integration;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * Backlog v1.x item 3: Potrzeby/Zamówienia (InventoryNeed + status flow).
 * OPEN → ORDERED → RECEIVED, cancellable until received; rows are evidence,
 * an open need blocks item deletion and duplicates for the same item (409).
 * Writes are ADMIN-only (B8), reads are for every band member.
 */
class NeedWorkflowIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private long createItem(String name) throws Exception {
        String body = postJson("/api/inventory/items?bandId=7",
                "{\"name\":\"" + name + "\",\"type\":\"INSTRUMENT\"}")
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    private long createNeed(long itemId, String json) throws Exception {
        String body = postJson("/api/inventory/needs?bandId=7", json)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    private static String createBody(long itemId, int quantity, String note) {
        return "{\"itemId\":" + itemId + ",\"quantity\":" + quantity
                + ",\"note\":\"" + note + "\",\"createdMemberId\":11}";
    }

    @Test
    void needFromNamelessItemSnapshotsSerialNotName() throws Exception {
        // Regresja V18: potrzeba tworzona z pozycji bez nazwy nie może wywalać
        // NOT NULL na migrodze name (V16 uczynił nazwę opcjonalną).
        String body = postJson("/api/inventory/items?bandId=7", "{\"type\":\"INSTRUMENT\"}")
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long item = MAPPER.readTree(body).get("id").longValue();

        long need = createNeed(item, createBody(item, 1, "pozycja bez nazwy"));
        mvc.perform(get("/api/inventory/needs/" + need).with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").isEmpty())
                .andExpect(jsonPath("$.serialNumber").isNotEmpty());
    }

    @Test
    void happyPathOpenOrderReceive() throws Exception {
        long item = createItem("Tub");
        long need = createNeed(item, createBody(item, 1, "zniknął z magazynu"));

        mvc.perform(get("/api/inventory/needs/" + need).header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.name").value("Tub"))
                .andExpect(jsonPath("$.quantity").value(1))
                .andExpect(jsonPath("$.createdMemberName").value("Jan Kowalski"))
                .andExpect(jsonPath("$.resolvedAt").isEmpty());

        postJson("/api/inventory/needs/" + need + "/status", "{\"status\":\"ORDERED\",\"note\":\"zamówione w Musik-Direkt\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ORDERED"));

        postJson("/api/inventory/needs/" + need + "/status", "{\"status\":\"RECEIVED\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RECEIVED"))
                .andExpect(jsonPath("$.resolutionNote").value("zamówione w Musik-Direkt"));

        // terminal — no further transitions
        postJson("/api/inventory/needs/" + need + "/status", "{\"status\":\"CANCELLED\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));
    }

    @Test
    void receiveRequiresPriorOrder() throws Exception {
        long item = createItem("Puzon");
        long need = createNeed(item, createBody(item, 1, "brak na spisie"));
        postJson("/api/inventory/needs/" + need + "/status", "{\"status\":\"RECEIVED\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));
    }

    @Test
    void cancelFromOpenIsFinal() throws Exception {
        long item = createItem("Klarnet II");
        long need = createNeed(item, createBody(item, 2, "komplet niepełny"));
        postJson("/api/inventory/needs/" + need + "/status", "{\"status\":\"CANCELLED\",\"note\":\"found na strychu\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        postJson("/api/inventory/needs/" + need + "/status", "{\"status\":\"ORDERED\"}")
                .andExpect(status().isConflict());

        // cancelled need frees the item — a new OPEN need is allowed again
        createNeed(item, createBody(item, 1, "jednak zepsuty"));
    }

    @Test
    void duplicateOpenNeedIsRejected() throws Exception {
        long item = createItem("Saksofon altowy");
        createNeed(item, createBody(item, 1, "pękł pasek"));
        postJson("/api/inventory/needs?bandId=7", createBody(item, 1, "znowu"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));
    }

    @Test
    void needCountsAsItemHistoryForDeletion() throws Exception {
        long item = createItem("Generalska");
        createNeed(item, createBody(item, 1, "brakuje"));
        mvc.perform(delete("/api/inventory/items/" + item)
                        .header("Authorization", "Bearer tok-admin"))
                .andExpect(status().isConflict());
    }

    @Test
    void writesAreAdminOnlyAndOutsiderIsRejected() throws Exception {
        long item = createItem("Kontrabas");
        postJson("/api/inventory/needs?bandId=7", createBody(item, 1, "brak strun"), "tok-member")
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/inventory/needs").param("bandId", "7")
                .header("Authorization", "Bearer tok-outsider"))
                .andExpect(status().isForbidden());
    }

    @Test
    void creatorMustBeActiveRosterMemberAndItemMustMatchBand() throws Exception {
        long item = createItem("Flet piccolo");
        postJson("/api/inventory/needs?bandId=7",
                "{\"itemId\":" + item + ",\"quantity\":1,\"createdMemberId\":13}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"));

        // foreign-band item into band 7 need → rejected
        String b3 = postJson("/api/inventory/items?bandId=3", "{\"name\":\"Obój\",\"type\":\"INSTRUMENT\"}",
                "tok-band3admin").andReturn().getResponse().getContentAsString();
        long foreignItem = MAPPER.readTree(b3).get("id").longValue();
        postJson("/api/inventory/needs?bandId=7", createBody(foreignItem, 1, "x"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void validationAndNotFoundAndStatusFilter() throws Exception {
        long item = createItem("Tamburyn potrzebny");
        postJson("/api/inventory/needs?bandId=7", createBody(item, 0, "źle"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"));

        postJson("/api/inventory/needs?bandId=7", createBody(999999, 1, "x"))
                .andExpect(status().isNotFound());

        createNeed(item, createBody(item, 1, "ok"));
        mvc.perform(get("/api/inventory/needs").param("bandId", "7").param("status", "OPEN")
                .header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].status").value("OPEN"));
        mvc.perform(get("/api/inventory/needs").param("bandId", "7").param("status", "RECEIVED")
                .header("Authorization", "Bearer tok-member"))
                .andExpect(jsonPath("$", hasSize(0)));
    }
}
