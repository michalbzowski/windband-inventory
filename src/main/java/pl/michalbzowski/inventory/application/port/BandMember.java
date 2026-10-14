package pl.michalbzowski.inventory.application.port;

/**
 * Roster member as served by WM's integration API
 * ({@code GET /api/v1/bands/{bandId}/members}; frozen contract in WM's
 * {@code BandInventoryApiController}). Inactive members are included and
 * flagged — inventory must not assign to them (analysis §2: MEMBER *aktywny*).
 */
public record BandMember(long memberId, String firstName, String lastName, boolean active) {

    /** Display snapshot stored on the assignment row. */
    public String fullName() {
        String first = firstName == null ? "" : firstName.trim();
        String last = lastName == null ? "" : lastName.trim();
        return (first + " " + last).trim();
    }
}
