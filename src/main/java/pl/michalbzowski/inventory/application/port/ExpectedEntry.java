package pl.michalbzowski.inventory.application.port;

/** One entry of a member's expected set — WM frozen contract (B10):
 *  {@code expectedSet:[{instrument, primary}]} from
 *  {@code GET /api/v1/bands/{bandId}/members}. Base of the F3 gap view. */
public record ExpectedEntry(String instrument, boolean primary) {
}
