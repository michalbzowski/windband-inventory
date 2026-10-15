package pl.michalbzowski.integration;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * Backlog v1.x item 4 (decision B14): Declarations of private/external ownership.
 * A declaration is an evidence row saying the item sits OUTSIDE the warehouse system
 * (PRIVATE at a member's place / EXTERNAL at some outside location). It never changes
 * warehouse or lifecycle status. One ACTIVE per item (partial unique index),
 * ACTIVE → REVOKED without reactivation, ASSIGNED items cannot be declared (409 —
 * the formal assignment is stronger evidence). Creates: any active member (B10
 * re-validation); revokes: ADMIN; reads: band members.
 */
class DeclarationWorkflowIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private long createItem(String name) throws Exception {
        String body = postJson("/api/inventory/items?bandId=7",
                "{\"name\":\"" + name + "\",\"type\":\"INSTRUMENT\"}")
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    private long createDeclaration(String json, String token) throws Exception {
        String body = postJson("/api/inventory/declarations?bandId=7", json, token)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    private static String privateBody(long itemId, long holderMemberId) {
        return "{\"itemId\":" + itemId + ",\"type\":\"PRIVATE\",\"holderMemberId\":" + holderMemberId
                + ",\"declaredByMemberId\":11,\"note\":\"leży w domu od wakacji\"}";
    }

    @Test
    void memberDeclaresPrivateThenAdminRevokesAndRetakeIsPossible() throws Exception {
        long item = createItem("Tuba");

        long id = createDeclaration(privateBody(item, 12), "tok-member");
        mvc.perform(get("/api/inventory/declarations/" + id).with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.type").value("PRIVATE"))
                .andExpect(jsonPath("$.name").value("Tuba"))
                .andExpect(jsonPath("$.holderMemberId").value(12))
                .andExpect(jsonPath("$.holderName").value("Anna Nowak"))
                .andExpect(jsonPath("$.declaredByName").value("Jan Kowalski"))
                .andExpect(jsonPath("$.revokedAt").isEmpty());

        // only one ACTIVE per item — duplicate rejected before hitting the DB index
        mvc.perform(post("/api/inventory/declarations?bandId=7")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(privateBody(item, 11)).with(as("tok-member")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));

        // member may not revoke (B8: ADMIN owns reversals of evidence state)
        postJson("/api/inventory/declarations/" + id + "/revoke", "{\"note\":\"wróciła\"}", "tok-member")
                .andExpect(status().isForbidden());

        postJson("/api/inventory/declarations/" + id + "/revoke", "{\"note\":\"oddana do magazynu\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVOKED"))
                .andExpect(jsonPath("$.revokedNote").value("oddana do magazynu"))
                .andExpect(jsonPath("$.revokedAt").isNotEmpty());

        // revoked never reactivates
        postJson("/api/inventory/declarations/" + id + "/revoke", "{}")
                .andExpect(status().isConflict());

        // the item is free for a fresh declaration — history stays as evidence
        createDeclaration(privateBody(item, 11), "tok-admin");
        mvc.perform(get("/api/inventory/declarations").param("bandId", "7")
                        .param("status", "ACTIVE").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void externalNeedsLocationText() throws Exception {
        long item = createItem("Kotły");
        postJson("/api/inventory/declarations?bandId=7",
                "{\"itemId\":" + item + ",\"type\":\"EXTERNAL\",\"declaredByMemberId\":11}", "tok-admin")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"));

        createDeclaration("{\"itemId\":" + item + ",\"type\":\"EXTERNAL\",\"locationText\":\"sala GOK, szafa 3\","
                + "\"declaredByMemberId\":12}", "tok-member");
        mvc.perform(get("/api/inventory/declarations").param("bandId", "7")
                        .param("type", "EXTERNAL").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].locationText").value("sala GOK, szafa 3"))
                .andExpect(jsonPath("$[0].holderName").doesNotExist());
    }

    @Test
    void assignedItemIsNotDeclarable() throws Exception {
        long item = createItem("Puzon");
        postJson("/api/inventory/items/" + item + "/assign", "{\"memberId\":12,\"note\":\"na próby\"}")
                .andExpect(status().isOk());

        postJson("/api/inventory/declarations?bandId=7", privateBody(item, 12), "tok-admin")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("status_conflict"));
    }

    @Test
    void holderAndDeclaratorMustBeActiveRosterMembers() throws Exception {
        long item = createItem("Klarnet");
        // Stefan (13) is inactive in the fixture roster
        postJson("/api/inventory/declarations?bandId=7", privateBody(item, 13), "tok-admin")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_request"));
        // declarator not in the roster at all
        postJson("/api/inventory/declarations?bandId=7",
                "{\"itemId\":" + item + ",\"type\":\"PRIVATE\",\"holderMemberId\":12,\"declaredByMemberId\":99}",
                "tok-admin")
                .andExpect(status().isBadRequest());
    }

    @Test
    void filtersListAndCrossBandIsolation() throws Exception {
        long a = createItem("Flet");
        long b = createItem("Waltornia");
        createDeclaration(privateBody(a, 12), "tok-member");
        createDeclaration("{\"itemId\":" + b + ",\"type\":\"EXTERNAL\",\"locationText\":\"strych\","
                + "\"declaredByMemberId\":11}", "tok-member");

        mvc.perform(get("/api/inventory/declarations").param("bandId", "7")
                        .param("holderMemberId", "12").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Flet"));

        mvc.perform(get("/api/inventory/declarations").param("bandId", "7")
                        .param("type", "EXTERNAL").param("status", "ACTIVE")
                        .with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));

        // outsider (band 9 only) sees nothing of band 7
        mvc.perform(get("/api/inventory/declarations").param("bandId", "7").with(as("tok-outsider")))
                .andExpect(status().isForbidden());
        // and cannot declare a band-7 item even under their own band (same-band rule)
        postJson("/api/inventory/declarations?bandId=9", privateBody(a, 11), "tok-outsider")
                .andExpect(status().isBadRequest());
    }

    @Test
    void declaredItemWithHistoryCannotBeDeleted() throws Exception {
        long item = createItem("Aplikacja mobilna — stand");
        createDeclaration("{\"itemId\":" + item + ",\"type\":\"EXTERNAL\",\"locationText\":\"archiwum\","
                + "\"declaredByMemberId\":11}", "tok-member");
        mvc.perform(delete("/api/inventory/items/" + item).with(as("tok-admin")))
                .andExpect(status().isConflict());
    }
}
