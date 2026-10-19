package pl.michalbzowski.inventory.adapter.in.rest;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import pl.michalbzowski.inventory.adapter.in.rest.dto.ServiceJobCreateRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.ServiceJobStatusRequest;
import pl.michalbzowski.inventory.adapter.in.security.BearerTokens;
import pl.michalbzowski.inventory.application.authz.BandAccessGuard;
import pl.michalbzowski.inventory.application.command.ServiceJobCommandService;
import pl.michalbzowski.inventory.application.query.ServiceJobQueryService;
import pl.michalbzowski.inventory.application.query.ServiceJobQueryService.ServiceJobView;
import pl.michalbzowski.inventory.domain.inventory.ServiceJobStatus;

/**
 * Service board REST surface (decision B15): repairs of EXISTING items, as
 * opposed to purchases (new items). Reads: any band member; writes: band ADMIN
 * (B8) — the same guard split as needs/purchases. SHIPPED / IN_STOCK /
 * HANDLED_OVER apply their item effects atomically with the status change
 * (see ServiceJobCommandService).
 */
@RestController
@RequestMapping("/api/inventory/service-jobs")
@PreAuthorize("isAuthenticated()")
public class ServiceJobController {

    private final ServiceJobQueryService queries;
    private final ServiceJobCommandService commands;
    private final BandAccessGuard guard;

    public ServiceJobController(ServiceJobQueryService queries, ServiceJobCommandService commands, BandAccessGuard guard) {
        this.queries = queries;
        this.commands = commands;
        this.guard = guard;
    }

    @GetMapping
    public List<ServiceJobView> list(@RequestParam("bandId") long bandId,
            @RequestParam(value = "status", required = false) ServiceJobStatus status) {
        guard.requireMember(bandId, BearerTokens.require());
        return queries.list(bandId, status);
    }

    @GetMapping("/{id}")
    public ServiceJobView detail(@PathVariable long id) {
        guard.requireMember(queries.bandOf(id), BearerTokens.require());
        return queries.view(id);
    }

    /** ADMIN reports a repair of an existing item; starts as REQUESTED (no item effects yet). */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ServiceJobView create(@RequestParam("bandId") long bandId,
            @Valid @RequestBody ServiceJobCreateRequest request) {
        guard.requireAdmin(bandId, BearerTokens.require());
        var job = commands.create(BearerTokens.require(), bandId, request.itemId(), request.reporterMemberId(),
                request.note(), request.createdMemberId());
        return queries.view(job.getId());
    }

    /** ADMIN walks the flow SHIPPED → REPAIRED → READY_FOR_PICKUP → IN_STOCK → HANDLED_OVER (or CANCELLED early). */
    @PostMapping("/{id}/status")
    public ServiceJobView changeStatus(@PathVariable long id, @Valid @RequestBody ServiceJobStatusRequest request) {
        guard.requireAdmin(queries.bandOf(id), BearerTokens.require());
        var job = commands.transition(BearerTokens.require(), id, request.status(), request.note());
        return queries.view(job.getId());
    }
}
