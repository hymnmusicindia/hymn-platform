package fun.hymnmusic.team;

/** Native values of the shared app/styles/theme-tokens.css contract. */
final class TeamPalette {
    final int background, elevated, card, text, muted, border, accent, accentForeground, error, errorSoft;
    TeamPalette(boolean dark) {
        background = dark ? 0xff0e1116 : 0xfff6f7f9;
        elevated = dark ? 0xff151a21 : 0xffedf0f4;
        card = dark ? 0xff171d25 : 0xffffffff;
        text = dark ? 0xfff2f5f8 : 0xff192330;
        muted = dark ? 0xffbbc5d1 : 0xff4c5b6d;
        border = dark ? 0xff354150 : 0xffcbd3de;
        accent = dark ? 0xffedf2f7 : 0xff202c3b;
        accentForeground = dark ? 0xff111820 : 0xffffffff;
        error = dark ? 0xffffaaa8 : 0xffa82f35;
        errorSoft = dark ? 0xff382328 : 0xfffbe7e8;
    }
}
