"""Draws the illustrated case photos for The Missing Original as SVG.

Evidence details sit exactly inside the hotspot rectangles declared in the
case pack (percentages of an 800x600 canvas) and are drawn small enough to
be readable only when zoomed in. Run: python3 scripts/draw-case-media.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "cases/missing-original/media"
W, H = 800, 600


def svg(body: str, bg: str = "#2a2420") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
        f'<rect width="{W}" height="{H}" fill="{bg}"/>{body}'
        # faint grain so it reads as a photo rather than a diagram
        '<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/>'
        '<feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.10 0"/></filter>'
        f'<rect width="{W}" height="{H}" filter="url(#g)"/></svg>'
    )


def embankment_print(x: int, y: int, w: int, h: int) -> str:
    """The front of 'The Embankment': a river, a stone parapet, lamp posts, fog."""
    lamps = "".join(
        f'<rect x="{x + w * f:.0f}" y="{y + h * 0.28:.0f}" width="3" height="{h * 0.42:.0f}" fill="#2b2b2b"/>'
        f'<circle cx="{x + w * f + 1.5:.0f}" cy="{y + h * 0.27:.0f}" r="6" fill="#d9d4c7"/>'
        for f in (0.18, 0.42, 0.66, 0.9)
    )
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#bdb8ad"/>'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h * 0.55:.0f}" fill="#cfcac0"/>'
        f'<path d="M{x} {y + h * 0.7:.0f} L{x + w} {y + h * 0.62:.0f} L{x + w} {y + h} L{x} {y + h} Z" fill="#6f6c66"/>'
        f'<rect x="{x}" y="{y + h * 0.68:.0f}" width="{w}" height="10" fill="#4d4a45"/>'
        f'{lamps}'
        f'<ellipse cx="{x + w * 0.3:.0f}" cy="{y + h * 0.86:.0f}" rx="{w * 0.25:.0f}" ry="6" fill="#8b877e" opacity="0.6"/>'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="#efeae0" stroke-width="10"/>'
    )


def shelf_scene(back_body: str, paper: str) -> str:
    folder = '<rect x="30" y="60" width="740" height="500" rx="6" fill="#3d3328"/>'
    shelf = '<rect x="0" y="560" width="800" height="40" fill="#1c1814"/><rect x="0" y="0" width="800" height="40" fill="#1c1814"/>'
    label = '<rect x="40" y="70" width="90" height="26" fill="#d9cfb8"/><text x="85" y="89" font-family="monospace" font-size="15" text-anchor="middle" fill="#3a3128">No.14</text>'
    front = embankment_print(60, 140, 300, 220)
    back = (
        f'<rect x="440" y="140" width="300" height="400" fill="{paper}"/>'
        '<rect x="440" y="140" width="300" height="400" fill="none" stroke="#00000022"/>'
        + back_body
    )
    captions = (
        '<text x="210" y="390" font-family="sans-serif" font-size="13" text-anchor="middle" fill="#b7aa95">front</text>'
        '<text x="590" y="130" font-family="sans-serif" font-size="13" text-anchor="middle" fill="#b7aa95">back</text>'
    )
    return shelf + folder + label + front + back + captions


def p1() -> str:
    # Hotspot: x 70–88 %, y 78–88 % → pencil mark and yellowed edge.
    mark = (
        '<rect x="440" y="520" width="300" height="20" fill="#e4d3a6" opacity="0.7"/>'
        '<text x="625" y="503" font-family="Bradley Hand, Segoe Script, cursive" font-size="9" fill="#6b6457" '
        'transform="rotate(-3 625 503)">No.14 / HL</text>'
    )
    return svg(shelf_scene(mark, "#efe6cf"))


def p2() -> str:
    return svg(shelf_scene("", "#fbfbf8"))


def p3() -> str:
    table = '<rect x="0" y="380" width="800" height="220" fill="#5a4632"/><rect x="0" y="372" width="800" height="12" fill="#6e5741"/>'
    wall = '<rect x="0" y="0" width="800" height="380" fill="#3b342d"/>'
    boxes = (
        '<rect x="60" y="250" width="160" height="130" fill="#b28b5e"/><rect x="60" y="250" width="160" height="18" fill="#9c774e"/>'
        '<rect x="240" y="290" width="120" height="90" fill="#b99467"/>'
        '<text x="140" y="320" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#5c4630">PackRight</text>'
    )
    rolls = (
        '<ellipse cx="420" cy="350" rx="16" ry="30" fill="#e9e3d6"/><rect x="420" y="320" width="150" height="60" fill="#e2dccc"/>'
        '<ellipse cx="570" cy="350" rx="16" ry="30" fill="#d5cfbf"/>'
    )
    # Envelope corner under paper offcuts. Hotspot x 22–36 %, y 58–68 %.
    envelope = (
        '<polygon points="180,350 290,352 292,410 182,408" fill="#efe2c4"/>'
        '<text x="268" y="374" font-family="Georgia, serif" font-size="8" font-style="italic" fill="#a88f5e">R.S.</text>'
        '<polygon points="150,340 240,330 260,385 165,400" fill="#f4f1ea" opacity="0.96"/>'
        '<polygon points="230,395 330,385 320,430 225,428" fill="#ece8de" opacity="0.95"/>'
    )
    # Cabinet with the door ajar and a flat parcel. Hotspot x 74–90 %, y 30–52 %.
    cabinet = (
        '<rect x="580" y="120" width="160" height="250" fill="#2b241e" stroke="#1a1612" stroke-width="4"/>'
        '<rect x="592" y="180" width="140" height="6" fill="#1a1612"/><rect x="592" y="250" width="140" height="6" fill="#1a1612"/>'
        '<rect x="602" y="236" width="110" height="14" fill="#cbbf9f"/>'
        '<rect x="640" y="236" width="4" height="14" fill="#a58f63"/>'
        '<polygon points="660,118 790,100 790,388 660,372" fill="#3f352b"/>'
        '<circle cx="672" cy="250" r="4" fill="#b8a27a"/>'
    )
    return svg(wall + cabinet + table + boxes + rolls + envelope)


def p4() -> str:
    door = '<rect x="0" y="0" width="800" height="600" fill="#2e3236"/><rect x="250" y="40" width="300" height="560" fill="#6b4c32"/>'
    courier = (
        '<circle cx="520" cy="210" r="40" fill="#c9a98a"/><rect x="470" y="250" width="110" height="200" fill="#c2412d"/>'
        '<rect x="430" y="330" width="120" height="90" fill="#b28b5e"/>'
        '<text x="490" y="380" font-family="sans-serif" font-size="12" fill="#5c4630">PackRight</text>'
    )
    marina = '<circle cx="300" cy="200" r="36" fill="#d8b89a"/><path d="M262 190 Q300 140 338 190 L338 230 L262 230 Z" fill="#3b2a20"/><rect x="262" y="236" width="76" height="200" fill="#48546a"/>'
    stamp = '<text x="20" y="580" font-family="monospace" font-size="16" fill="#e6e6e6">CAM-1  WED 11:22:07</text>'
    lens = '<radialGradient id="v"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient><rect width="800" height="600" fill="url(#v)"/>'
    return svg(door + marina + courier + lens + stamp)


def hall(people: bool) -> str:
    wall = '<rect width="800" height="420" fill="#e9e5dc"/><rect y="420" width="800" height="180" fill="#9b8a75"/>'
    frames = "".join(
        f'<rect x="{x}" y="120" width="{w}" height="{h}" fill="#1e1e1e"/>'
        f'<rect x="{x + 10}" y="130" width="{w - 20}" height="{h - 20}" fill="#{shade}"/>'
        for x, w, h, shade in ((70, 150, 190, "a9a49a"), (300, 200, 150, "8f8a80"), (580, 150, 190, "b5b0a6"))
    )
    figures = (
        '<circle cx="380" cy="330" r="22" fill="#c9a98a"/><rect x="358" y="352" width="44" height="130" fill="#2f3b4c"/>'
        '<circle cx="450" cy="335" r="20" fill="#d8b89a"/><rect x="430" y="355" width="40" height="125" fill="#48546a"/>'
        '<rect x="408" y="300" width="22" height="14" fill="#fafafa"/>'
        if people
        else ""
    )
    return svg(wall + frames + figures)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, body in {"p1": p1(), "p2": p2(), "p3": p3(), "p4": p4(), "p5": hall(False), "p6": hall(True)}.items():
        (OUT / f"{name}.svg").write_text(body)
        print("wrote", OUT / f"{name}.svg")


if __name__ == "__main__":
    main()
