package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * POST /items/{id}/service/complete (F4). {@code nextServiceDate} is the plan
 * for the "do serwisu" list; null CLEARS the previous plan.
 */
public record ServiceCompleteRequest(
        @Size(max = 2000, message = "notatka jest za długa") String note,
        LocalDate nextServiceDate) {
}
