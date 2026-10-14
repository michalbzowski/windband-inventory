package pl.michalbzowski.integration;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * F4 (backlog v1.x item 2): service workflow — sendToService → IN_SERVICE →
 * completeService with nextServiceDate, the "do serwisu" list and evidence
 * rows in item_service_events (one open event per item, like assignments).
 */
class ServiceWorkflowIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private long createItem(String name) throws Exception {
        String body = postJson("/api/inventory/items?bandId=7",
                "{\"name\":\"" + name + "\",\"type\":\"INSTRUMENT\"}")
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    private void send(long itemId, String note) throws Exception {
        postJson("/api/inventory/items/" + itemId + "/service", "{\"note\":\"" + note + "\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("IN_SERVICE"));
    }

    private void complete(long itemId, String note, String nextDate) throws Exception {
        String date = nextDate == null ? "null" : "\"" + nextDate + "\"";
        postJson("/api/inventory/items/" + itemId + "/service/complete",
                "{\"note\":\"" + note + "\",\"nextServiceDate\":" + date + "}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("AVAILABLE"));
    }

    @Test
    void sendToServiceThenCompleteStoresNextDate() throws Exception {
        long id = createItem("Tamburyn");
        send(id, "pęknięta membrana");

        mvc.perform(get("/api/inventory/items/" + id + "/services")
                .header("Authorization", "Bearer tok-admin"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].sentNote").value("pęknięta membrana"))
                .andExpect(jsonPath("$[0].completedAt").isEmpty());

        complete(id, "naprawiony", "2027-06-01");

        mvc.perform(get("/api/inventory/items/" + id)
                .header("Authorization", "Bearer tok-admin"))
                .andExpect(jsonPath("$.nextServiceDate").value("2027-06-01"));

        mvc.perform(get("/api/inventory/items/" + id + "/services")
                .header("Authorization", "Bearer tok-admin"))
                .andExpect(jsonPath("$[0].completedNote").value("naprawiony"))
                .andExpect(jsonPath("$[0].nextServiceDate").value("2027-06-01"));
    }

    @Test
    void invalidTransitionsAreConflict() throws Exception {
        long id = createItem("Klarnet");

        // AVAILABLE cannot be "completed"
        postJson("/api/inventory/items/" + id + "/service/complete", "{\"note\":\"x\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));

        send(id, "first");
        // double send
        postJson("/api/inventory/items/" + id + "/service", "{\"note\":\"again\"}")
                .andExpect(status().isConflict());
        // assigned precondition untouched: cannot assign while in service
        postJson("/api/inventory/items/" + id + "/assign", "{\"memberId\":11}")
                .andExpect(status().isConflict());
    }

    @Test
    void assignedItemIsSentViaReturnIntoService() throws Exception {
        long id = createItem("Saksofon");
        postJson("/api/inventory/items/" + id + "/assign", "{\"memberId\":11,\"note\":\"koncert\"}")
                .andExpect(status().isOk());
        // return straight into service — opens the evidence event too
        postJson("/api/inventory/items/" + id + "/unassign",
                "{\"state\":\"IN_SERVICE\",\"note\":\"do regeneracji\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lifecycleStatus").value("IN_SERVICE"));

        mvc.perform(get("/api/inventory/items/" + id + "/services")
                .header("Authorization", "Bearer tok-member"))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].sentNote").value("do regeneracji"));

        complete(id, "gotowy", null);
        mvc.perform(get("/api/inventory/items/" + id)
                .header("Authorization", "Bearer tok-member"))
                .andExpect(jsonPath("$.nextServiceDate").isEmpty());
    }

    @Test
    void serviceDueListShowsOnlyOverdueAvailableItems() throws Exception {
        long overdue = createItem("Flet");
        long future = createItem("Trąbka");
        long noDate = createItem("Puzon");
        long inService = createItem("Percussion");

        send(overdue, "przegląd");
        complete(overdue, "po przeglądzie", "2025-01-15");
        send(future, "przegląd");
        complete(future, "po przeglądzie", "2099-01-15");
        send(inService, "przegląd");
        complete(inService, "po przeglądzie", "2025-01-15");
        send(inService, "znowu w serwisie");
        // noDate was never serviced → null date, must not appear

        mvc.perform(get("/api/inventory/items?bandId=7&serviceDue=true")
                .header("Authorization", "Bearer tok-admin"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name == 'Flet')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.name == 'Trąbka')]").isEmpty())
                .andExpect(jsonPath("$[?(@.name == 'Puzon')]").isEmpty())
                .andExpect(jsonPath("$[?(@.name == 'Percussion')]").isEmpty());
    }

    @Test
    void memberCannotWriteServiceButCanReadHistory() throws Exception {
        long id = createItem("Kontrabas");
        postJson("/api/inventory/items/" + id + "/service", "{\"note\":\"x\"}", "tok-member")
                .andExpect(status().isForbidden());
        postJson("/api/inventory/items/" + id + "/service/complete", "{\"note\":\"x\"}", "tok-member")
                .andExpect(status().isForbidden());

        send(id, "most");
        mvc.perform(get("/api/inventory/items/" + id + "/services")
                .header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk());
    }

    @Test
    void updateBasicsCannotTouchServiceDate() throws Exception {
        long id = createItem("Alt");
        send(id, "s");
        complete(id, "ok", "2027-01-01");

        // PUT without the service field must keep the date (it is not basics-editable)
        mvc.perform(put("/api/inventory/items/" + id)
                .header("Authorization", "Bearer tok-admin")
                .contentType("application/json")
                .content("{\"name\":\"Altówka\",\"type\":\"INSTRUMENT\",\"attributes\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nextServiceDate").value("2027-01-01"));
    }
}
