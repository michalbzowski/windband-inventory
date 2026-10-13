package pl.michalbzowski.inventory.application.authz;

/**
 * The caller is not allowed to act on the band in scope of this request
 * (not a member, or lacking ADMIN for writes — matrix in section 2 of the
 * frozen analysis). Rendered as HTTP 403.
 */
public class BandForbiddenException extends RuntimeException {

    public BandForbiddenException(String message) {
        super(message);
    }
}
