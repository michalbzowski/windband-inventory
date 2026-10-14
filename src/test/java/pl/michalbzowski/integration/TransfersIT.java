package pl.michalbzowski.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Warehouse transfers over REST (decision B6): ADMIN-only moves (role
 * matrix §2), immutable history newest-first, lifecycle guards
 * (ASSIGNED/LOST cannot move), the PUT warehouse-integrity rule and the
 * band-scoped authz on both write and read.
 */
class TransfersIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private long createInstrument(String name) throws Exception {
        ResultActions created = postJson("/api/inventory/items?bandId=7",
                "{\"name\":\"" + name + "\",\"type\":\"INSTRUMENT\"}");
        String body = created.andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    private ResultActions transfer(long id, String json, String token) throws Exception {
        return postJson("/api/inventory/items/" + id + "/transfers", json, token);
    }

    private ResultActions putItem(long id, String json, String token) throws Exception {
        return mvc.perform(put("/api/inventory/items/{id}", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json)
                .with(as(token)));
    }

    @Test
    void happyPathMovesItemAndWritesHistoryVisibleToMembers() throws Exception {
        long id = createInstrument("Klarnet");

        transfer(id, "{\"to\":\"SERVICE\",\"note\":\"do stroiciela\"}", "tok-admin")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.warehouse").value("SERVICE"))
                .andExpect(jsonPath("$.lifecycleStatus").value("AVAILABLE"));

        mvc.perform(get("/api/inventory/items/{id}/transfers", id).with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].fromWarehouse").value("MAIN"))
                .andExpect(jsonPath("$[0].toWarehouse").value("SERVICE"))
                .andExpect(jsonPath("$[0].note").value("do stroiciela"))
                .andExpect(jsonPath("$[0].transferredAt").value(not(nullValue())));

        // The list filter now finds it in the target warehouse.
        mvc.perform(get("/api/inventory/items").param("bandId", "7")
                        .param("warehouse", "SERVICE").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].warehouse").value("SERVICE"));
    }

    @Test
    void historyIsNewestFirst() throws Exception {
        long id = createInstrument("Tuba");

        transfer(id, "{\"to\":\"SERVICE\"}", "tok-admin").andExpect(status().isOk());
        transfer(id, "{\"to\":\"ARCHIVE\"}", "tok-admin").andExpect(status().isOk());

        mvc.perform(get("/api/inventory/items/{id}/transfers", id).with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].fromWarehouse").value("SERVICE"))
                .andExpect(jsonPath("$[0].toWarehouse").value("ARCHIVE"))
                .andExpect(jsonPath("$[0].note").value(nullValue()))
                .andExpect(jsonPath("$[1].fromWarehouse").value("MAIN"))
                .andExpect(jsonPath("$[1].toWarehouse").value("SERVICE"));
    }

    @Test
    void freshItemHasEmptyHistory() throws Exception {
        long id = createInstrument("Trójkąt");

        mvc.perform(get("/api/inventory/items/{id}/transfers", id).with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void editCannotChangeWarehouseWithoutTransfer() throws Exception {
        long id = createInstrument("Sakshorn");

        putItem(id, "{\"name\":\"Sakshorn po\",\"warehouse\":\"ARCHIVE\"}", "tok-admin")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("transfer")));

        mvc.perform(get("/api/inventory/items/{id}", id).with(as("tok-member")))
                .andExpect(jsonPath("$.warehouse").value("MAIN"))
                .andExpect(jsonPath("$.name").value("Sakshorn"));
    }

    @Test
    void editWithUnchangedWarehouseStillWorks() throws Exception {
        long id = createInstrument("Waltornia");

        putItem(id, "{\"name\":\"Waltornia I\",\"warehouse\":\"MAIN\"}", "tok-admin")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Waltornia I"))
                .andExpect(jsonPath("$.warehouse").value("MAIN"));

        putItem(id, "{\"name\":\"Waltornia II\"}", "tok-admin")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Waltornia II"));
    }

    @Test
    void sameWarehouseTransferIsRejected() throws Exception {
        long id = createInstrument("Kontrabas");

        transfer(id, "{\"to\":\"MAIN\"}", "tok-admin")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"));

        mvc.perform(get("/api/inventory/items/{id}/transfers", id).with(as("tok-member")))
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void missingTargetWarehouseIsRejected() throws Exception {
        long id = createInstrument("Obój");

        transfer(id, "{\"note\":\"bez celu\"}", "tok-admin")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"));
    }

    @Test
    void assignedItemCannotBeTransferred() throws Exception {
        long id = createInstrument("Puzon suwakowy");

        postJson("/api/inventory/items/" + id + "/assign", "{\"memberId\":11}", "tok-admin")
                .andExpect(status().isOk());

        transfer(id, "{\"to\":\"SERVICE\"}", "tok-admin")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));
    }

    @Test
    void lostItemCannotBeTransferred() throws Exception {
        long id = createInstrument("Cymbały");

        postJson("/api/inventory/items/" + id + "/assign", "{\"memberId\":11}", "tok-admin")
                .andExpect(status().isOk());
        postJson("/api/inventory/items/" + id + "/unassign", "{\"state\":\"LOST\"}", "tok-admin")
                .andExpect(status().isOk());

        transfer(id, "{\"to\":\"ARCHIVE\"}", "tok-admin")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));
    }

    @Test
    void memberRoleCannotTransfer() throws Exception {
        long id = createInstrument("Flet poprzeczny");

        transfer(id, "{\"to\":\"SERVICE\"}", "tok-member")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("forbidden"));
    }

    @Test
    void otherBandUsersGetForbiddenOnBothEndpoints() throws Exception {
        long id = createInstrument("Kotły");

        transfer(id, "{\"to\":\"SERVICE\"}", "tok-outsider")
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/inventory/items/{id}/transfers", id).with(as("tok-outsider")))
                .andExpect(status().isForbidden());
        // ADMIN of band 3 has no role on band 7 — neither read nor write.
        mvc.perform(get("/api/inventory/items/{id}/transfers", id).with(as("tok-band3admin")))
                .andExpect(status().isForbidden());
        transfer(id, "{\"to\":\"SERVICE\"}", "tok-band3admin")
                .andExpect(status().isForbidden());
    }

    @Test
    void unknownItemGivesNotFoundOnBothEndpoints() throws Exception {
        transfer(987654L, "{\"to\":\"SERVICE\"}", "tok-admin")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not_found"));
        mvc.perform(get("/api/inventory/items/{id}/transfers", 987654L).with(as("tok-admin")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not_found"));
    }

    @Test
    void anonymousTransferCallIsUnauthorized() throws Exception {
        mvc.perform(post("/api/inventory/items/1/transfers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"to\":\"SERVICE\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void freshItemWithoutHistoryCanBeDeleted() throws Exception {
        long id = createInstrument("Tamburyn");

        mvc.perform(delete("/api/inventory/items/{id}", id).with(as("tok-admin")))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/inventory/items/{id}", id).with(as("tok-admin")))
                .andExpect(status().isNotFound());
    }

    @Test
    void historyWrittenByTransferBlocksDeletion() throws Exception {
        long id = createInstrument("Marimba");

        transfer(id, """
                {"to":"SERVICE","note":"remont"}""", "tok-admin")
                .andExpect(status().isOk());

        mvc.perform(delete("/api/inventory/items/{id}", id).with(as("tok-admin")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));
        mvc.perform(get("/api/inventory/items/{id}", id).with(as("tok-member")))
                .andExpect(status().isOk());
    }
}
