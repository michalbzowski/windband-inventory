package pl.michalbzowski.inventory.application.command;

/** Member id absent from the band's live WM roster — 404, never 500 (F3 picture). */
public class MemberNotFoundException extends RuntimeException {

    public MemberNotFoundException(long memberId) {
        super("Członek " + memberId + " nie należy do tego bandu");
    }
}
