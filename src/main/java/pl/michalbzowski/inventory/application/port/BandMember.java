package pl.michalbzowski.inventory.application.port;

import java.util.List;

/**
 * Roster member as served by WM's integration API
 * ({@code GET /api/v1/bands/{bandId}/members}; frozen contract in WM's
 * {@code BandInventoryApiController}). Inactive members are included and
 * flagged — inventory must not assign to them (analysis §2: MEMBER *aktywny*).
 *
 * <p>{@code expectedSet} (F3, v1.x): the instruments WM expects this member
 * to hold — read-only reference data, never copied into inventory (B1).
 */
public record BandMember(long memberId, String firstName, String lastName, boolean active,
        List<ExpectedEntry> expectedSet) {

    public BandMember {
        expectedSet = expectedSet == null ? List.of() : List.copyOf(expectedSet);
    }

    /** Roster row without an expected set (assignment checks do not need F3 data). */
    public BandMember(long memberId, String firstName, String lastName, boolean active) {
        this(memberId, firstName, lastName, active, List.of());
    }

    /** Display snapshot stored on the assignment row. */
    public String fullName() {
        String first = firstName == null ? "" : firstName.trim();
        String last = lastName == null ? "" : lastName.trim();
        return (first + " " + last).trim();
    }
}
