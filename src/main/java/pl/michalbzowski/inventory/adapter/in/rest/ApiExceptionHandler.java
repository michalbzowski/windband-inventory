package pl.michalbzowski.inventory.adapter.in.rest;

import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import pl.michalbzowski.inventory.application.authz.BandForbiddenException;
import pl.michalbzowski.inventory.application.command.AttributeDefDuplicateException;
import pl.michalbzowski.inventory.application.command.AttributeDefNotFoundException;
import pl.michalbzowski.inventory.application.command.ItemNotFoundException;
import pl.michalbzowski.inventory.application.command.MemberNotFoundException;
import pl.michalbzowski.inventory.application.command.NeedNotFoundException;
import pl.michalbzowski.inventory.application.command.StocktakeLineNotFoundException;
import pl.michalbzowski.inventory.application.command.StocktakeNotFoundException;
import pl.michalbzowski.inventory.application.port.WmUnavailableException;
import pl.michalbzowski.inventory.domain.inventory.AttributeValueInvalidException;

/**
 * Uniform JSON error bodies for the REST layer.
 *
 * <p>Code semantics are frozen by the NFR: 403 cross-band, 404 unknown id,
 * 400 validation, 503 when the WM role lookup is unavailable (B1/B10).
 */
@Slf4j
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler({ItemNotFoundException.class, AttributeDefNotFoundException.class,
            MemberNotFoundException.class, NeedNotFoundException.class,
            StocktakeNotFoundException.class, StocktakeLineNotFoundException.class})
    public ResponseEntity<Map<String, String>> notFound(RuntimeException ex) {
        return body(HttpStatus.NOT_FOUND, "not_found", ex.getMessage());
    }

    @ExceptionHandler(BandForbiddenException.class)
    public ResponseEntity<Map<String, String>> forbidden(BandForbiddenException ex) {
        return body(HttpStatus.FORBIDDEN, "forbidden", ex.getMessage());
    }

    @ExceptionHandler({AttributeValueInvalidException.class, IllegalArgumentException.class})
    public ResponseEntity<Map<String, String>> invalid(RuntimeException ex) {
        return body(HttpStatus.BAD_REQUEST, "invalid_request", ex.getMessage());
    }

    @ExceptionHandler(AttributeDefDuplicateException.class)
    public ResponseEntity<Map<String, String>> duplicate(AttributeDefDuplicateException ex) {
        return body(HttpStatus.CONFLICT, "duplicate", ex.getMessage());
    }

    /** Lifecycle conflicts: assign to a non-AVAILABLE item, return a non-ASSIGNED one,
     *  delete an assigned one — the current state forbids the operation. */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> conflict(IllegalStateException ex) {
        return body(HttpStatus.CONFLICT, "status_conflict", ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> payloadInvalid(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .reduce((a, b) -> a + "; " + b)
                .orElse("Nieprawidłowe dane zapytania");
        return body(HttpStatus.BAD_REQUEST, "invalid_request", message);
    }

    @ExceptionHandler(WmUnavailableException.class)
    public ResponseEntity<Map<String, String>> upstream(WmUnavailableException ex) {
        log.warn("windband-manager unavailable: {}", ex.getMessage());
        return body(HttpStatus.SERVICE_UNAVAILABLE, "upstream_unavailable", ex.getMessage());
    }

    private static ResponseEntity<Map<String, String>> body(HttpStatus status, String error, String message) {
        return ResponseEntity.status(status).body(Map.of("error", error, "message", message));
    }
}
