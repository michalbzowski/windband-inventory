package pl.michalbzowski.inventory.adapter.in.rest;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pl.michalbzowski.inventory.adapter.in.security.BearerTokens;
import pl.michalbzowski.inventory.application.authz.BandAccessGuard;
import pl.michalbzowski.inventory.application.query.MemberPictureQueryService;
import pl.michalbzowski.inventory.application.query.MemberPictureViews.MemberPictureView;

/**
 * F3 member picture (backlog v1.x item 1): expected (WM roster expectedSet)
 * vs held (ASSIGNED items) vs gap + view-only assignment history.
 *
 * <p>Read use-case: every band role suffices (B8 guards writes only); the
 * roster itself already comes from WM with the caller's token, so a caller
 * cannot enumerate members of foreign bands.
 */
@RestController
@RequestMapping("/api/inventory/members")
@RequiredArgsConstructor
public class MemberPictureController {

    private final BandAccessGuard guard;
    private final MemberPictureQueryService pictures;

    @GetMapping("/{memberId}/picture")
    public MemberPictureView picture(@PathVariable long memberId, @RequestParam long bandId) {
        String token = BearerTokens.require();
        guard.requireMember(bandId, token);
        return pictures.picture(token, bandId, memberId);
    }
}
