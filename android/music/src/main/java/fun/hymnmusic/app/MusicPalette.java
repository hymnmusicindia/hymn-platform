package fun.hymnmusic.app;
final class MusicPalette {
    final int background, surface, text, muted, border, accent, onAccent, error;
    MusicPalette(boolean dark) {
        background=dark?0xff0e1116:0xfff6f7f9; surface=dark?0xff171d25:0xffffffff;
        text=dark?0xfff2f5f8:0xff192330; muted=dark?0xffbbc5d1:0xff4c5b6d;
        border=dark?0xff354150:0xffcbd3de; accent=dark?0xffe6d2a3:0xff202c3b; onAccent=dark?0xff17242a:0xffffffff;
        error=dark?0xffffaaa8:0xffa82f35;
    }
}
