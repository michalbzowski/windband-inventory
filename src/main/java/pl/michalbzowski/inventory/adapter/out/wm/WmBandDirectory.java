package pl.michalbzowski.inventory.adapter.out.wm;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import pl.michalbzowski.inventory.application.authz.BandForbiddenException;
import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandMember;
import pl.michalbzowski.inventory.application.port.BandRole;
import pl.michalbzowski.inventory.application.port.WmUnavailableException;

/**
 * WM adapter for {@link BandDirectory}: calls {@code GET /api/v1/me/bands}
 * with the caller's own bearer token (decision B10 — roles live only in WM).
 *
 * <p>Short session cache: keyed by a hash of the token, TTL 60 s max
 * (integration skill: no longer caches; a stale ADMIN grant is a security
 * risk, a 60 s one is acceptable). Never stores band/member data as a local
 * source of truth.
 */
@Component
public class WmBandDirectory implements BandDirectory {

    private static final ParameterizedTypeReference<List<BandDto>> BANDS_LIST =
            new ParameterizedTypeReference<>() {
            };
    private static final ParameterizedTypeReference<List<MemberDto>> MEMBERS_LIST =
            new ParameterizedTypeReference<>() {
            };
    /** Hard cap against memory abuse under token churn. */
    private static final int MAX_ENTRIES = 5_000;

    private final RestClient restClient;
    private final long ttlMillis;
    private final ConcurrentHashMap<String, CacheEntry> cache = new ConcurrentHashMap<>();

    @Autowired
    public WmBandDirectory(
            @Value("${wm.api-url}") String wmApiUrl,
            @Value("${wm.cache-ttl-seconds:60}") long ttlSeconds) {
        this(buildClient(wmApiUrl), Duration.ofSeconds(ttlSeconds).toMillis());
    }

    /** Test seam: pre-built client (MockRestServiceServer binds to its builder). */
    WmBandDirectory(RestClient restClient, long ttlMillis) {
        this.restClient = restClient;
        this.ttlMillis = Math.max(0, Math.min(ttlMillis, Duration.ofSeconds(60).toMillis()));
    }

    @Override
    public Map<Long, BandRole> myBands(String bearerToken) {
        String key = sha256(bearerToken);
        long now = System.currentTimeMillis();
        CacheEntry hit = cache.get(key);
        if (hit != null && hit.expiresAtMillis() > now) {
            return hit.roles();
        }
        List<BandDto> bands = getFromWm("/api/v1/me/bands", BANDS_LIST, bearerToken);
        Map<Long, BandRole> roles = (bands == null ? List.<BandDto>of() : bands).stream()
                .collect(Collectors.toUnmodifiableMap(BandDto::bandId, BandDto::role, (a, b) -> a));
        if (cache.size() >= MAX_ENTRIES) {
            evictExpired(now);
            if (cache.size() >= MAX_ENTRIES) {
                cache.clear();
            }
        }
        cache.put(key, new CacheEntry(roles, now + ttlMillis));
        return roles;
    }

    @Override
    public List<BandMember> members(String bearerToken, long bandId) {
        // No cache: the ACTIVE roster check must reflect WM at write time.
        List<MemberDto> rows = getFromWm("/api/v1/bands/{bandId}/members",
                MEMBERS_LIST, bearerToken, bandId);
        return (rows == null ? List.<MemberDto>of() : rows).stream()
                .map(m -> new BandMember(m.memberId(), m.firstName(), m.lastName(), m.active()))
                .toList();
    }

    /** GET with caller-token auth + frozen error mapping (B10: WM outage = 503). */
    private <T> T getFromWm(String path, ParameterizedTypeReference<T> type,
            String bearerToken, Object... uriVars) {
        try {
            return restClient.get()
                    .uri(path, uriVars)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                    .retrieve()
                    .body(type);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 401 || status == 403) {
                // WM did not accept the token it shares an issuer with — re-login territory.
                throw new BandForbiddenException(
                        "windband-manager odrzucił token sesji — zaloguj się ponownie");
            }
            throw new WmUnavailableException(
                    "windband-manager odpowiedział błędem " + status);
        } catch (RestClientException ex) {
            throw new WmUnavailableException(
                    "Brak odpowiedzi z windband-manager: " + ex.getMessage());
        }
    }

    private void evictExpired(long now) {
        cache.entrySet().removeIf(e -> e.getValue().expiresAtMillis() <= now);
    }

    private static RestClient buildClient(String wmApiUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(10));
        return RestClient.builder().baseUrl(wmApiUrl).requestFactory(factory).build();
    }

    private static String sha256(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    /** WM row: {bandId, name, role} (frozen B10 contract). */
    record BandDto(long bandId, String name, BandRole role) {
    }

    /** WM roster row: {memberId, firstName, lastName, active, expectedSet} —
     *  expectedSet is intentionally NOT mapped here (F3 view, v1.x). */
    record MemberDto(long memberId, String firstName, String lastName, boolean active) {
    }

    private record CacheEntry(Map<Long, BandRole> roles, long expiresAtMillis) {
    }
}
