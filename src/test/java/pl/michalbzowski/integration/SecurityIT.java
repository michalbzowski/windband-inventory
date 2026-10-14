package pl.michalbzowski.integration;

import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unauthenticated access to the inventory API is rejected; the public edge
 * (health/SPA) must not require a token.
 */
class SecurityIT extends AbstractIntegrationTest {

    @Test
    void anonymousApiCallIsRejected() throws Exception {
        // Real chain: no credentials -> BearerTokenAuthenticationEntryPoint -> 401.
        mvc.perform(get("/api/inventory/items?bandId=7"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void actuatorHealthIsPublic() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());
    }
}
