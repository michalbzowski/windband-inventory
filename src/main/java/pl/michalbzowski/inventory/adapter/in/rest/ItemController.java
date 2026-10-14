package pl.michalbzowski.inventory.adapter.in.rest;

import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.michalbzowski.inventory.adapter.in.rest.dto.AssignRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.ItemCreateRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.ItemUpdateRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.ServiceCompleteRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.ServiceSendRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.TransferRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.UnassignRequest;
import pl.michalbzowski.inventory.adapter.in.security.BearerTokens;
import pl.michalbzowski.inventory.application.authz.BandAccessGuard;
import pl.michalbzowski.inventory.application.command.AssignCommandService;
import pl.michalbzowski.inventory.application.command.ItemCommandService;
import pl.michalbzowski.inventory.application.command.ServiceCommandService;
import pl.michalbzowski.inventory.application.command.TransferCommandService;
import pl.michalbzowski.inventory.application.query.ItemQueryService;
import pl.michalbzowski.inventory.application.query.ItemViews.AssignmentView;
import pl.michalbzowski.inventory.application.query.ItemViews.ItemSummaryView;
import pl.michalbzowski.inventory.application.query.ItemViews.ItemView;
import pl.michalbzowski.inventory.application.query.ItemViews.ServiceEventView;
import pl.michalbzowski.inventory.application.query.ItemViews.WarehouseTransferView;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/**
 * REST contract for inventory items (analysis 3.1/3.2: everything under
 * {@code /api/inventory/...}, JSON, 403 cross-band, 404 unknown id).
 *
 * <p>Collection endpoints ({@code list}, {@code create}) take {@code bandId}
 * explicitly; detail endpoints derive the band from the loaded row and check
 * membership before returning anything.
 */
@RestController
@RequestMapping("/api/inventory/items")
@RequiredArgsConstructor
public class ItemController {

    private final ItemQueryService queries;
    private final ItemCommandService commands;
    private final AssignCommandService assignments;
    private final TransferCommandService transfers;
    private final ServiceCommandService services;
    private final BandAccessGuard guard;

    @GetMapping
    public List<ItemSummaryView> list(
            @RequestParam("bandId") long bandId,
            @RequestParam(required = false) ItemType type,
            @RequestParam(required = false) ItemLifecycleStatus status,
            @RequestParam(required = false) WarehouseType warehouse,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long assignedMemberId,
            @RequestParam(required = false) Long attributeDefId,
            @RequestParam(required = false) String attributeValue,
            @RequestParam(required = false) Boolean serviceDue) {
        guard.requireMember(bandId, BearerTokens.require());
        return queries.list(bandId, type, status, warehouse, search, assignedMemberId,
                attributeDefId, attributeValue, serviceDue);
    }

    @GetMapping("/{id}")
    public ItemView detail(@PathVariable long id) {
        long bandId = queries.bandOf(id);
        guard.requireMember(bandId, BearerTokens.require());
        return queries.detail(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ItemView create(@RequestParam("bandId") long bandId,
            @Valid @RequestBody ItemCreateRequest request) {
        guard.requireAdmin(bandId, BearerTokens.require());
        InventoryItem item = commands.create(bandId, request.toCommand());
        return queries.detail(item.getId());
    }

    @PutMapping("/{id}")
    public ItemView update(@PathVariable long id, @Valid @RequestBody ItemUpdateRequest request) {
        long bandId = queries.bandOf(id);
        guard.requireAdmin(bandId, BearerTokens.require());
        InventoryItem item = commands.update(id, request.toCommand());
        return queries.detail(item.getId());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        long bandId = queries.bandOf(id);
        guard.requireAdmin(bandId, BearerTokens.require());
        commands.delete(id);
    }

    /** Assign to an ACTIVE band member — ADMIN only (role matrix §2). */
    @PostMapping("/{id}/assign")
    public ItemView assign(@PathVariable long id, @Valid @RequestBody AssignRequest request) {
        long bandId = queries.bandOf(id);
        guard.requireAdmin(bandId, BearerTokens.require());
        InventoryItem item = assignments.assign(id, BearerTokens.require(),
                request.memberId(), request.note());
        return queries.detail(item.getId());
    }

    /** Return from the member; {@code state} = condition it comes back in. */
    @PostMapping("/{id}/unassign")
    public ItemView unassign(@PathVariable long id, @Valid @RequestBody UnassignRequest request) {
        long bandId = queries.bandOf(id);
        guard.requireAdmin(bandId, BearerTokens.require());
        InventoryItem item = assignments.unassign(id, request.state(), request.note());
        return queries.detail(item.getId());
    }

    /** Assignment history (readable by every band member — §2 "przegląd"). */
    @GetMapping("/{id}/assignments")
    public List<AssignmentView> history(@PathVariable long id) {
        long bandId = queries.bandOf(id);
        guard.requireMember(bandId, BearerTokens.require());
        return queries.assignments(id);
    }

    /** Move between warehouses — ADMIN only (role matrix §2 "transfery", B6). */
    @PostMapping("/{id}/transfers")
    public ItemView transfer(@PathVariable long id, @Valid @RequestBody TransferRequest request) {
        long bandId = queries.bandOf(id);
        guard.requireAdmin(bandId, BearerTokens.require());
        InventoryItem item = transfers.transfer(id, request.to(), request.note());
        return queries.detail(item.getId());
    }

    /** Transfer history of the item (every band member may read it). */
    @GetMapping("/{id}/transfers")
    public List<WarehouseTransferView> transferHistory(@PathVariable long id) {
        long bandId = queries.bandOf(id);
        guard.requireMember(bandId, BearerTokens.require());
        return queries.transfers(id);
    }

    /** F4 sendToService: AVAILABLE → IN_SERVICE — ADMIN only (B8). */
    @PostMapping("/{id}/service")
    public ItemView sendToService(@PathVariable long id,
            @Valid @RequestBody(required = false) ServiceSendRequest request) {
        long bandId = queries.bandOf(id);
        guard.requireAdmin(bandId, BearerTokens.require());
        String note = request == null ? null : request.note();
        InventoryItem item = services.send(id, note);
        return queries.detail(item.getId());
    }

    /** F4 completeService: IN_SERVICE → AVAILABLE (+ next-service plan) — ADMIN only. */
    @PostMapping("/{id}/service/complete")
    public ItemView completeService(@PathVariable long id,
            @Valid @RequestBody(required = false) ServiceCompleteRequest request) {
        long bandId = queries.bandOf(id);
        guard.requireAdmin(bandId, BearerTokens.require());
        String note = request == null ? null : request.note();
        LocalDate next = request == null ? null : request.nextServiceDate();
        InventoryItem item = services.complete(id, note, next);
        return queries.detail(item.getId());
    }

    /** Service-workflow history of the item (every band member may read it). */
    @GetMapping("/{id}/services")
    public List<ServiceEventView> serviceHistory(@PathVariable long id) {
        long bandId = queries.bandOf(id);
        guard.requireMember(bandId, BearerTokens.require());
        return queries.services(id);
    }
}
