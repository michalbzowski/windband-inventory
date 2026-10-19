package pl.michalbzowski.inventory.adapter.in.rest;

import jakarta.validation.Valid;
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
import pl.michalbzowski.inventory.adapter.in.rest.dto.PurchaseCreateRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.PurchaseStatusRequest;
import pl.michalbzowski.inventory.adapter.in.security.BearerTokens;
import pl.michalbzowski.inventory.application.authz.BandAccessGuard;
import pl.michalbzowski.inventory.application.command.PurchaseCommandService;
import pl.michalbzowski.inventory.application.query.PurchaseQueryService;
import pl.michalbzowski.inventory.application.query.PurchaseQueryService.PurchaseView;
import pl.michalbzowski.inventory.domain.inventory.PurchaseStatus;

/**
 * Purchases REST surface (roadmap 2026-10-19): new items for named members.
 * Reads: any band member; writes: band ADMIN (B8) — same guard split as
 * needs. DELIVERED materialises the warehouse item; RECEIVED assigns it.
 */
@RestController
@RequestMapping("/api/inventory/purchases")
@PreAuthorize("isAuthenticated()")
public class PurchaseController {

    private final PurchaseQueryService queries;
    private final PurchaseCommandService commands;
    private final BandAccessGuard guard;

    public PurchaseController(PurchaseQueryService queries, PurchaseCommandService commands, BandAccessGuard guard) {
        this.queries = queries;
        this.commands = commands;
        this.guard = guard;
    }

    @GetMapping
    public List<PurchaseView> list(@RequestParam("bandId") long bandId,
            @RequestParam(value = "status", required = false) PurchaseStatus status) {
        guard.requireMember(bandId, BearerTokens.require());
        return queries.list(bandId, status);
    }

    @GetMapping("/{id}")
    public PurchaseView detail(@PathVariable long id) {
        guard.requireMember(queries.bandOf(id), BearerTokens.require());
        return queries.detail(id);
    }

    /** ADMIN records a purchase for a member; starts as REQUESTED. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PurchaseView create(@RequestParam("bandId") long bandId,
            @Valid @RequestBody PurchaseCreateRequest request) {
        guard.requireAdmin(bandId, BearerTokens.require());
        var purchase = commands.create(BearerTokens.require(), bandId, request.name(), request.itemType(),
                request.requestedForMemberId(), request.note(), request.createdMemberId());
        return queries.detail(purchase.getId());
    }

    /** ADMIN walks the flow SENT → IN_PROGRESS → DELIVERED → READY_FOR_PICKUP → RECEIVED / CANCELLED. */
    @PostMapping("/{id}/status")
    public PurchaseView changeStatus(@PathVariable long id, @Valid @RequestBody PurchaseStatusRequest request) {
        guard.requireAdmin(queries.bandOf(id), BearerTokens.require());
        var purchase = commands.changeStatus(BearerTokens.require(), id, request.status(), request.note());
        return queries.detail(purchase.getId());
    }
}
