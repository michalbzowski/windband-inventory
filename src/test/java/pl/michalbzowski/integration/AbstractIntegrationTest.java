package pl.michalbzowski.integration;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import pl.michalbzowski.inventory.InventoryApplication;
import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandMember;
import pl.michalbzowski.inventory.application.port.BandRole;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignmentRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDefRepository;
import pl.michalbzowski.inventory.domain.inventory.WarehouseTransferRepository;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Shared Testcontainers harness: real PostgreSQL + Flyway + full Spring context.
 * The WM roles port is mocked (external system; its adapter has its own unit
 * tests against a stubbed HTTP server). Token names select fixture role maps,
 * mirroring B8 semantics:
 * band 7 — tok-admin ADMIN / tok-member MEMBER; band 3 — ADMIN for tok-admin;
 * tok-outsider belongs only to band 9.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        classes = InventoryApplication.class)
@AutoConfigureMockMvc
public abstract class AbstractIntegrationTest {

    /**
     * Started once per JVM and NEVER stopped from JUnit: failsafe caches the
     * Spring context (and its JDBC URL) across test classes, so a per-class
     * container lifecycle would kill the database under later classes.
     * Ryuk removes it when the test JVM exits.
     */
    private static final PostgreSQLContainer<?> PG = createAndStartContainer();

    private static PostgreSQLContainer<?> createAndStartContainer() {
        PostgreSQLContainer<?> container =
                new PostgreSQLContainer<>("postgres:16-alpine").withDatabaseName("inventory");
        container.start();
        return container;
    }

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", PG::getJdbcUrl);
        registry.add("spring.datasource.username", PG::getUsername);
        registry.add("spring.datasource.password", PG::getPassword);
    }

    private static final Map<String, Map<Long, BandRole>> ROLES_BY_TOKEN = Map.of(
            "tok-admin", Map.of(7L, BandRole.ADMIN, 3L, BandRole.MEMBER),
            "tok-band3admin", Map.of(3L, BandRole.ADMIN),
            "tok-member", Map.of(7L, BandRole.MEMBER),
            "tok-outsider", Map.of(9L, BandRole.ADMIN));

    /** WM roster fixtures (B10 port): band 7 — 11/12 active, 13 inactive; band 3 — 21. */
    private static final Map<Long, java.util.List<BandMember>> ROSTER_BY_BAND = Map.of(
            7L, java.util.List.of(
                    new BandMember(11L, "Jan", "Kowalski", true),
                    new BandMember(12L, "Anna", "Nowak", true),
                    new BandMember(13L, "Stefan", "Stary", false)),
            3L, java.util.List.of(new BandMember(21L, "Ewa", "Duda", true)));

    @MockBean
    protected BandDirectory bandDirectory;

    /**
     * Stub decoder so the real {@code BearerTokenAuthenticationFilter} runs
     * end-to-end: any bearer string becomes a valid Jwt (identity by subject).
     * Signature verification itself is Keycloak's contract, tested upstream.
     */
    @MockBean
    protected JwtDecoder jwtDecoder;

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected InventoryItemRepository items;
    @Autowired
    protected ItemAssignmentRepository assignments;

    @Autowired
    protected ItemAttributeDefRepository attributeDefs;

    @Autowired
    protected WarehouseTransferRepository warehouseTransfers;

    @BeforeEach
    void resetFixtures() {
        reset(bandDirectory);
        when(bandDirectory.myBands(anyString())).thenAnswer(inv ->
                ROLES_BY_TOKEN.getOrDefault(inv.<String>getArgument(0), new LinkedHashMap<Long, BandRole>()));
        when(bandDirectory.members(anyString(), org.mockito.ArgumentMatchers.anyLong())).thenAnswer(inv ->
                ROSTER_BY_BAND.getOrDefault(inv.<Long>getArgument(1), java.util.List.of()));
        when(jwtDecoder.decode(anyString())).thenAnswer(inv -> Jwt.withTokenValue(inv.getArgument(0))
                .header("alg", "none")
                .subject("user")
                .issuedAt(java.time.Instant.now())
                .expiresAt(java.time.Instant.now().plusSeconds(3_600))
                .build());
        // History rows reference items — children before parents.
        warehouseTransfers.deleteAll();
        assignments.deleteAll();
        items.deleteAll();
        attributeDefs.deleteAll();
    }

    /** Full production path: Authorization header through the real filter chain. */
    protected static RequestPostProcessor as(String token) {
        return request -> {
            request.addHeader("Authorization", "Bearer " + token);
            return request;
        };
    }

    /** Convenience POST with the band-7 admin fixture token. */
    protected ResultActions postJson(String url, String json) throws Exception {
        return postJson(url, json, "tok-admin");
    }

    protected ResultActions postJson(String url, String json, String token) throws Exception {
        return mvc.perform(post(url)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json)
                .with(as(token)));
    }
}
