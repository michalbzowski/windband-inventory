package pl.michalbzowski.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Assign/return over REST: ADMIN-only writes (role matrix §2), live-roster
 * validation (B10), ASSIGNED status + snapshot, the assignee filter and the
 * immutable history (analysis 3.1).
 */
class AssignmentsIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private long createItem(String band, String json) throws Exception {
        return idOf(postJson("/api/inventory/items?bandId=" + band, json,
                "3".equals(band) ? "tok-band3admin" : "tok-admin")
                .andExpect(status().isCreated()));
    }

    private long createInstrument(String name) throws Exception {
        return createItem("7", "{\"name\":\"" + name + "\",\"type\":\"INSTRUMENT\"}");
    }

    private static long idOf(ResultActions result) throws Exception {
        String body = result.andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    @Test
    void assignReturnHappyPathWithDefaultState() throws Exception {
        long id = createInstrument("Saksofon altowy");

        postJson("/api/inventory/items/" + id + "/assign",
                "{\"memberId\":12,\"note\":\"na próby\"}", "tok-admin")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("ASSIGNED"))
                .andExpect(jsonPath("$.assignedMemberId").value(12))
                .andExpect(jsonPath("$.assignedMemberName").value("Anna Nowak"));

        // The assignee filter (3.1 "listy z filtrami").
        mvc.perform(get("/api/inventory/items").param("bandId", "7")
                        .param("assignedMemberId", "12").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Saksofon altowy"))
                .andExpect(jsonPath("$[0].assignedMemberName").value("Anna Nowak"));

        mvc.perform(get("/api/inventory/items/{id}/assignments", id).with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].memberName").value("Anna Nowak"))
                .andExpect(jsonPath("$[0].assignNote").value("na próby"))
                .andExpect(jsonPath("$[0].returnedAt").value(nullValue()));

        postJson("/api/inventory/items/" + id + "/unassign", "{}", "tok-admin")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("AVAILABLE"))
                .andExpect(jsonPath("$.assignedMemberId").value(nullValue()));

        mvc.perform(get("/api/inventory/items/{id}/assignments", id).with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].returnedState").value("AVAILABLE"))
                .andExpect(jsonPath("$[0].returnedAt").exists());
    }

    @Test
    void damagedReturnLandsInServiceWithNote() throws Exception {
        long id = createInstrument("Puzon");
        postJson("/api/inventory/items/" + id + "/assign", "{\"memberId\":11}", "tok-admin")
                .andExpect(status().isOk());

        postJson("/api/inventory/items/" + id + "/unassign",
                "{\"state\":\"IN_SERVICE\",\"note\":\"wgnieciona kruczyna\"}", "tok-admin")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("IN_SERVICE"));

        mvc.perform(get("/api/inventory/items/{id}/assignments", id).with(as("tok-admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].returnedState").value("IN_SERVICE"))
                .andExpect(jsonPath("$[0].returnNote").value("wgnieciona kruczyna"));
    }

    @Test
    void dashboardCounterUsesStatusAssignedFilter() throws Exception {
        // The Pulpit "Aktywne przydziały" tile counts GET /items?status=ASSIGNED —
        // never covered by an IT; regression guard for the 2026-10-21 report.
        long assigned = createInstrument("Kontra basowa");
        long spare = createInstrument("Trąbka");
        postJson("/api/inventory/items/" + assigned + "/assign", "{\"memberId\":11}", "tok-admin")
                .andExpect(status().isOk());

        mvc.perform(get("/api/inventory/items").param("bandId", "7")
                        .param("status", "ASSIGNED").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(assigned))
                .andExpect(jsonPath("$[0].assignedMemberName").value("Jan Kowalski"));

        mvc.perform(get("/api/inventory/items").param("bandId", "7")
                        .param("status", "AVAILABLE").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + spare + ")]", hasSize(1)))
                .andExpect(jsonPath("$[?(@.id == " + assigned + ")]", hasSize(0)));
    }

    @Test
    void secondAssignWithoutReturnIsAConflict() throws Exception {
        long id = createInstrument("Klarnet");
        postJson("/api/inventory/items/" + id + "/assign", "{\"memberId\":11}", "tok-admin")
                .andExpect(status().isOk());

        postJson("/api/inventory/items/" + id + "/assign", "{\"memberId\":12}", "tok-admin")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));
    }

    @Test
    void returnOfNeverAssignedItemIsAConflict() throws Exception {
        long id = createInstrument("Tuba");

        postJson("/api/inventory/items/" + id + "/unassign", "{}", "tok-admin")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));
    }

    @Test
    void memberAndOutsiderCannotAssign() throws Exception {
        long id = createInstrument("Flet");

        postJson("/api/inventory/items/" + id + "/assign", "{\"memberId\":11}", "tok-member")
                .andExpect(status().isForbidden());
        postJson("/api/inventory/items/" + id + "/assign", "{\"memberId\":11}", "tok-outsider")
                .andExpect(status().isForbidden());
        // Band 7 admin is only MEMBER in band 3 — cannot assign band 3 items.
        long band3Item = createItem("3", "{\"name\":\"Werbel\",\"type\":\"EQUIPMENT\"}");
        postJson("/api/inventory/items/" + band3Item + "/assign", "{\"memberId\":21}", "tok-admin")
                .andExpect(status().isForbidden());
    }

    @Test
    void rosterValidationRejectsForeignAndInactiveMembers() throws Exception {
        long id = createInstrument("Kontrabas");

        postJson("/api/inventory/items/" + id + "/assign", "{\"memberId\":999}", "tok-admin")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("nie należy do tego bandu")));

        postJson("/api/inventory/items/" + id + "/assign", "{\"memberId\":13}", "tok-admin")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("nieaktywny")));
    }

    @Test
    void assignedItemCannotBeDeleted() throws Exception {
        long id = createInstrument("Fortepian");
        postJson("/api/inventory/items/" + id + "/assign", "{\"memberId\":11}", "tok-admin")
                .andExpect(status().isOk());

        mvc.perform(delete("/api/inventory/items/{id}", id).with(as("tok-admin")))
                .andExpect(status().isConflict());
    }
}
