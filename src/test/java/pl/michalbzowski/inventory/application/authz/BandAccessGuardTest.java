package pl.michalbzowski.inventory.application.authz;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandRole;

@ExtendWith(MockitoExtension.class)
class BandAccessGuardTest {

    @Mock
    private BandDirectory bandDirectory;

    @InjectMocks
    private BandAccessGuard guard;

    @Test
    void memberWithAnyRolePasses() {
        when(bandDirectory.myBands("tok")).thenReturn(Map.of(7L, BandRole.MEMBER));
        assertThat(guard.requireMember(7L, "tok")).isEqualTo(BandRole.MEMBER);
    }

    @Test
    void foreignUserIsRejectedForBand() {
        when(bandDirectory.myBands("tok")).thenReturn(Map.of(3L, BandRole.ADMIN));
        assertThatThrownBy(() -> guard.requireMember(7L, "tok"))
                .isInstanceOf(BandForbiddenException.class);
    }

    @Test
    void memberIsNotEnoughForAdminCheck() {
        when(bandDirectory.myBands("tok")).thenReturn(Map.of(7L, BandRole.MEMBER));
        assertThatThrownBy(() -> guard.requireAdmin(7L, "tok"))
                .isInstanceOf(BandForbiddenException.class)
                .hasMessageContaining("administratora");
    }

    @Test
    void adminPassesAdminCheck() {
        when(bandDirectory.myBands("tok")).thenReturn(Map.of(7L, BandRole.ADMIN));
        guard.requireAdmin(7L, "tok");
    }
}
