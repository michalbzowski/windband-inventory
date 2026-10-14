package pl.michalbzowski.integration;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * F3 (backlog item 1): per-member full picture — expected (WM expectedSet)
 * vs actual (held items) vs gap + read-only assignment history.
 * Roster fixture (band 7, member 11 Jan Kowalski): expects Flet (primary)
 * and Altówka (secondary) — see AbstractIntegrationTest.ROSTER_BY_BAND.
 */
class MemberPictureIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private long createItem(String name, String type) throws Exception {
        String body = postJson("/api/inventory/items?bandId=7",
                "{\"name\":\"" + name + "\",\"type\":\"" + type + "\"}")
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    private void assign(long itemId, long memberId, String note) throws Exception {
        postJson("/api/inventory/items/" + itemId + "/assign",
                "{\"memberId\":" + memberId + ",\"note\":\"" + note + "\"}")
                .andExpect(status().isOk());
    }

    @Test
    void pictureMergesExpectedActualAndGap() throws Exception {
        long fletId = createItem("Flet piccolo", "INSTRUMENT");
        assign(fletId, 11, "koncert");

        mvc.perform(get("/api/inventory/members/11/picture?bandId=7")
                .header("Authorization", "Bearer tok-admin"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.memberId").value(11))
                .andExpect(jsonPath("$.memberName").value("Jan Kowalski"))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.expected", hasSize(2)))
                .andExpect(jsonPath("$.expected[0].instrument").value("Flet"))
                .andExpect(jsonPath("$.expected[0].primary").value(true))
                .andExpect(jsonPath("$.expected[0].satisfied").value(true))
                .andExpect(jsonPath("$.expected[0].matchedItemIds[0]").value(fletId))
                .andExpect(jsonPath("$.expected[1].instrument").value("Altówka"))
                .andExpect(jsonPath("$.expected[1].satisfied").value(false))
                .andExpect(jsonPath("$.gapCount").value(1))
                .andExpect(jsonPath("$.actual", hasSize(1)))
                .andExpect(jsonPath("$.actual[0].name").value("Flet piccolo"))
                .andExpect(jsonPath("$.actual[0].assignedMemberId").value(11))
                .andExpect(jsonPath("$.history", hasSize(1)))
                .andExpect(jsonPath("$.history[0].itemName").value("Flet piccolo"))
                .andExpect(jsonPath("$.history[0].returnedAt").isEmpty());
    }

    @Test
    void historyShowsOpenAndClosedAssignments() throws Exception {
        long fletId = createItem("Flet", "INSTRUMENT");
        long uniformId = createItem("Mundur", "UNIFORM");
        assign(fletId, 11, "pierwszy");
        mvc.perform(post("/api/inventory/items/" + fletId + "/unassign")
                .header("Authorization", "Bearer tok-admin")
                .contentType("application/json")
                .content("{\"state\":\"AVAILABLE\",\"note\":\"oddany\"}"))
                .andExpect(status().isOk());
        assign(fletId, 11, "drugi");
        assign(uniformId, 11, "mundur");

        mvc.perform(get("/api/inventory/members/11/picture?bandId=7")
                .header("Authorization", "Bearer tok-member"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.actual", hasSize(2)))
                .andExpect(jsonPath("$.history", hasSize(3)))
                .andExpect(jsonPath("$.history[0].returnedAt").isEmpty())
                .andExpect(jsonPath("$.history[2].returnedState").value("AVAILABLE"))
                .andExpect(jsonPath("$.history[2].returnNote").value("oddany"));
    }

    @Test
    void memberNotInBandRosterIsNotFound() throws Exception {
        mvc.perform(get("/api/inventory/members/99/picture?bandId=7")
                .header("Authorization", "Bearer tok-admin"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not_found"));
    }

    @Test
    void crossBandMemberIsNotFoundNotLeaked() throws Exception {
        // Member 21 exists — but in band 3, never under band 7.
        mvc.perform(get("/api/inventory/members/21/picture?bandId=7")
                .header("Authorization", "Bearer tok-admin"))
                .andExpect(status().isNotFound());
    }

    @Test
    void outsiderIsForbidden() throws Exception {
        mvc.perform(get("/api/inventory/members/11/picture?bandId=7")
                .header("Authorization", "Bearer tok-band3admin"))
                .andExpect(status().isForbidden());
    }
}
