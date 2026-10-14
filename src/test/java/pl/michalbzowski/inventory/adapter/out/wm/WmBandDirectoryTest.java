package pl.michalbzowski.inventory.adapter.out.wm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.MockRestServiceServer.bindTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import pl.michalbzowski.inventory.application.authz.BandForbiddenException;
import pl.michalbzowski.inventory.application.port.BandRole;
import pl.michalbzowski.inventory.application.port.WmUnavailableException;

/**
 * The WM roles adapter against a stubbed HTTP server: contract parsing,
 * pass-through of the bearer token, short TTL cache and error mapping.
 */
class WmBandDirectoryTest {

    private RestClient.Builder builder;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        builder = RestClient.builder().baseUrl("http://wm.test");
        server = bindTo(builder).ignoreExpectOrder(true).build();
    }

    private WmBandDirectory directory(long ttlMillis) {
        return new WmBandDirectory(builder.build(), ttlMillis);
    }

    @Test
    void parsesBandsAndPassesBearerTokenThrough() {
        server.expect(requestTo("http://wm.test/api/v1/me/bands"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer tok-1"))
                .andRespond(withSuccess(
                        "[{\"bandId\":7,\"name\":\"Big Band\",\"role\":\"ADMIN\"},"
                                + "{\"bandId\":3,\"name\":\"Drum Club\",\"role\":\"MEMBER\"}]",
                        MediaType.APPLICATION_JSON));

        Map<Long, BandRole> roles = directory(60_000).myBands("tok-1");

        assertThat(roles).containsEntry(7L, BandRole.ADMIN).containsEntry(3L, BandRole.MEMBER);
        server.verify();
    }

    @Test
    void cachedWithinTtl() {
        server.expect(requestTo("http://wm.test/api/v1/me/bands"))
                .andRespond(withSuccess("[{\"bandId\":7,\"name\":\"B\",\"role\":\"MEMBER\"}]",
                        MediaType.APPLICATION_JSON));
        WmBandDirectory dir = directory(60_000);
        dir.myBands("tok");
        Map<Long, BandRole> second = dir.myBands("tok");
        assertThat(second).hasSize(1);
        server.verify(); // exactly one request fulfilled the expectation
    }

    @Test
    void zeroTtlRefetches() {
        server.expect(requestTo("http://wm.test/api/v1/me/bands"))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://wm.test/api/v1/me/bands"))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
        WmBandDirectory dir = directory(0);
        dir.myBands("tok");
        dir.myBands("tok");
        server.verify();
    }

    @Test
    void differentTokensDoNotShareCache() {
        server.expect(requestTo("http://wm.test/api/v1/me/bands"))
                .andRespond(withSuccess("[{\"bandId\":7,\"name\":\"B\",\"role\":\"ADMIN\"}]",
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://wm.test/api/v1/me/bands"))
                .andRespond(withSuccess("[{\"bandId\":3,\"name\":\"C\",\"role\":\"MEMBER\"}]",
                        MediaType.APPLICATION_JSON));
        WmBandDirectory dir = directory(60_000);
        assertThat(dir.myBands("tok-a")).containsKey(7L);
        assertThat(dir.myBands("tok-b")).containsKey(3L);
        server.verify();
    }

    @Test
    void wmUnauthorizedBecomesForbidden() {
        server.expect(requestTo("http://wm.test/api/v1/me/bands"))
                .andRespond(withStatus(org.springframework.http.HttpStatus.UNAUTHORIZED));
        assertThatThrownBy(() -> directory(60_000).myBands("stary-token"))
                .isInstanceOf(BandForbiddenException.class);
    }

    @Test
    void wmServerErrorIsUpstreamUnavailable() {
        server.expect(requestTo("http://wm.test/api/v1/me/bands"))
                .andRespond(withStatus(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR));
        assertThatThrownBy(() -> directory(60_000).myBands("tok"))
                .isInstanceOf(WmUnavailableException.class);
    }
}
