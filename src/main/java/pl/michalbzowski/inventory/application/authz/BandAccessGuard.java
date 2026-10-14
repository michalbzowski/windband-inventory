package pl.michalbzowski.inventory.application.authz;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandRole;

/**
 * Server-side band authorization on EVERY request (NFR: authz by band).
 * Roles are resolved through the WM API with the caller's token — a JWT is
 * proof of identity only, never of a band role (decision B5/B10 note in the
 * analysis: {@code UserTeamRole} lives in WM's database, not in OIDC claims).
 */
@Service
@RequiredArgsConstructor
public class BandAccessGuard {

    private final BandDirectory bandDirectory;

    /** Any role (ADMIN or MEMBER) on the band. */
    public BandRole requireMember(long bandId, String bearerToken) {
        BandRole role = bandDirectory.myBands(bearerToken).get(bandId);
        if (role == null) {
            throw new BandForbiddenException(
                    "Nie należysz do tego bandu lub należysz nieaktywnie");
        }
        return role;
    }

    /** Band administrator (writes: items, definitions, stocktake start/close — B8). */
    public void requireAdmin(long bandId, String bearerToken) {
        if (requireMember(bandId, bearerToken) != BandRole.ADMIN) {
            throw new BandForbiddenException("Ta operacja wymaga roli administratora bandu");
        }
    }
}
