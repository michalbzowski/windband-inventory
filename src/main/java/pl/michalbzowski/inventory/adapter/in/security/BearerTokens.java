package pl.michalbzowski.inventory.adapter.in.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import pl.michalbzowski.inventory.application.authz.BandForbiddenException;

/**
 * Reads the raw bearer token of the current request so it can be forwarded to
 * the windband-manager API (roles are WM data, decision B10). The resource
 * server has already validated the signature/issuer — this is identity
 * propagation, not authentication.
 */
public final class BearerTokens {

    private static final String PREFIX = "Bearer ";

    private BearerTokens() {
    }

    public static String require() {
        ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        HttpServletRequest request = attrs == null ? null : attrs.getRequest();
        String header = request == null ? null : request.getHeader("Authorization");
        if (header == null || !header.startsWith(PREFIX) || header.length() <= PREFIX.length()) {
            throw new BandForbiddenException("Brak tokenu sesji — nie można zweryfikować ról bandu");
        }
        return header.substring(PREFIX.length()).trim();
    }
}
