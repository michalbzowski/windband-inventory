package pl.michalbzowski.inventory.application.port;

import java.util.List;
import java.util.Map;

/**
 * Read port for band membership/roles (decision B1/B10): roles live ONLY in
 * the windband-manager database — never in OIDC claims — and are fetched from
 * its integration API with the caller's own bearer token.
 */
public interface BandDirectory {

    /**
     * Bands of the requesting user with their WM roles.
     *
     * @param bearerToken the access token presented to inventory (passed through to WM)
     * @return bandId -> role, for every band the user belongs to
     * @throws WmUnavailableException when WM cannot be reached
     */
    Map<Long, BandRole> myBands(String bearerToken);

    /**
     * Band roster with active flags (WM: {@code GET /api/v1/bands/{bandId}/members}).
     * Called on assign only — never cached: the ACTIVE check must reflect WM now.
     *
     * @throws WmUnavailableException when WM cannot be reached
     */
    List<BandMember> members(String bearerToken, long bandId);
}
