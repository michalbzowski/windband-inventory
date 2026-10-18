package pl.michalbzowski.integration;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.ObjectMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Attribute definition API: creation rules, uniqueness per (band, type),
 * ordering for the two-step item form and soft deactivation (history-safe).
 */
class AttributeDefsIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private long idOf(ResultActions result) throws Exception {
        String body = result.andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    @Test
    void createListUpdateAndSoftDelete() throws Exception {
        long defId = idOf(postJson("/api/inventory/attribute-defs?bandId=7", """
                {"name":"Materiał","itemType":"INSTRUMENT","dataType":"MULTI",
                 "displayOrder":2,"required":false,"options":["mosiądz","nikiel"]}""", "tok-admin")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.options[0]").value("mosiądz"))
                .andExpect(jsonPath("$.active").value(true)));

        mvc.perform(get("/api/inventory/attribute-defs?bandId=7&type=INSTRUMENT").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(defId));

        mvc.perform(put("/api/inventory/attribute-defs/{id}", defId)
                        .contentType("application/json")
                        .content("{\"displayOrder\":9,\"required\":true}")
                        .with(as("tok-admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayOrder").value(9))
                .andExpect(jsonPath("$.required").value(true));

        mvc.perform(delete("/api/inventory/attribute-defs/{id}", defId).with(as("tok-admin")))
                .andExpect(status().isNoContent());

        // Active-only listing hides it; ?all=true shows the deactivated row for history.
        mvc.perform(get("/api/inventory/attribute-defs?bandId=7&type=INSTRUMENT").with(as("tok-admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.empty()));
        mvc.perform(get("/api/inventory/attribute-defs?bandId=7&type=INSTRUMENT&all=true")
                        .with(as("tok-admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].active").value(false));
    }

    @Test
    void deactivateThenReactivateViaPutActive() throws Exception {
        long defId = idOf(postJson("/api/inventory/attribute-defs?bandId=7", """
                {"name":"Rozmiar kołnierza","itemType":"UNIFORM","dataType":"SELECT",
                 "displayOrder":3,"options":["S","M","L"]}""", "tok-admin")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.active").value(true)));

        mvc.perform(delete("/api/inventory/attribute-defs/{id}", defId).with(as("tok-admin")))
                .andExpect(status().isNoContent());

        // PUT bez `active` — stan nieaktywny nietknięty (kontrakcja dla starych klientów).
        mvc.perform(put("/api/inventory/attribute-defs/{id}", defId)
                        .contentType("application/json").content("{\"displayOrder\":5}")
                        .with(as("tok-admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.displayOrder").value(5));

        mvc.perform(put("/api/inventory/attribute-defs/{id}", defId)
                        .contentType("application/json").content("{\"active\":true}")
                        .with(as("tok-admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true));

        mvc.perform(get("/api/inventory/attribute-defs?bandId=7&type=UNIFORM").with(as("tok-member")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(defId))
                .andExpect(jsonPath("$[0].displayOrder").value(5));
    }

    @Test
    void duplicateNameInSameBandAndTypeIsConflict() throws Exception {
        postJson("/api/inventory/attribute-defs?bandId=7", """
                {"name":"Materiał","itemType":"INSTRUMENT","dataType":"TEXT"}""", "tok-admin")
                .andExpect(status().isCreated());

        postJson("/api/inventory/attribute-defs?bandId=7", """
                {"name":"materiał","itemType":"INSTRUMENT","dataType":"TEXT"}""", "tok-admin")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("duplicate"));

        // Other item type may reuse the name.
        postJson("/api/inventory/attribute-defs?bandId=7", """
                {"name":"Materiał","itemType":"UNIFORM","dataType":"TEXT"}""", "tok-admin")
                .andExpect(status().isCreated());
    }

    @Test
    void selectDefinitionRequiresOptions() throws Exception {
        postJson("/api/inventory/attribute-defs?bandId=7", """
                {"name":"Rozmiar","itemType":"UNIFORM","dataType":"SELECT"}""", "tok-admin")
                .andExpect(status().isBadRequest());
    }

    @Test
    void memberCannotManageDefinitions() throws Exception {
        postJson("/api/inventory/attribute-defs?bandId=7", """
                {"name":"X","itemType":"OTHER","dataType":"TEXT"}""", "tok-member")
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/inventory/attribute-defs?bandId=7").with(as("tok-member")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/inventory/attribute-defs?bandId=7").with(as("tok-outsider")))
                .andExpect(status().isForbidden());
    }

    @Test
    void defsAreNotVisibleAcrossBands() throws Exception {
        long defId = idOf(postJson("/api/inventory/attribute-defs?bandId=3", """
                {"name":"Band3-only","itemType":"OTHER","dataType":"TEXT"}""", "tok-band3admin")
                .andExpect(status().isCreated()));
        // Band 7 admin is only MEMBER in band 3 -> cannot update band 3 defs.
        mvc.perform(put("/api/inventory/attribute-defs/{id}", defId)
                        .contentType("application/json")
                        .content("{\"displayOrder\":3}")
                        .with(as("tok-admin")))
                .andExpect(status().isForbidden());
        // Outsider cannot even list them.
        mvc.perform(get("/api/inventory/attribute-defs?bandId=3").with(as("tok-outsider")))
                .andExpect(status().isForbidden());
    }
}
