package pl.michalbzowski.inventory.application.port;

/**
 * windband-manager could not be reached while resolving band membership.
 * Rendered as HTTP 503 — inventory must not guess roles (B10).
 */
public class WmUnavailableException extends RuntimeException {

    public WmUnavailableException(String message) {
        super(message);
    }
}
