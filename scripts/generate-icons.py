"""Genera los íconos PWA (ejecutar: python3 scripts/generate-icons.py)."""
from PIL import Image, ImageDraw

def icon(size: int, maskable: bool = False) -> Image.Image:
    s = size * 4  # supersampling
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    grad = Image.new("RGBA", (s, s))
    top, bottom = (139, 92, 246), (91, 33, 182)
    px = grad.load()
    for y in range(s):
        for x in range(s):
            t = (x + y) / (2 * s)
            px[x, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
    mask = Image.new("L", (s, s), 0)
    radius = 0 if maskable else int(s * 0.22)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=255)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    pad = s * (0.28 if maskable else 0.2)
    span = s - 2 * pad
    pts = [(0.0, 0.75), (0.35, 0.45), (0.58, 0.62), (1.0, 0.2)]
    line = [(pad + x * span, pad + y * span) for x, y in pts]
    w = int(s * 0.075)
    d.line(line, fill="white", width=w, joint="curve")
    for p in line:
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill="white")
    ax, ay = line[-1]
    a = span * 0.22
    d.line([(ax - a, ay), (ax, ay), (ax, ay + a)], fill="white", width=w, joint="curve")
    for p in [(ax - a, ay), (ax, ay + a), (ax, ay)]:
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill="white")
    return img.resize((size, size), Image.LANCZOS)

for size in (192, 512):
    icon(size).save(f"public/icons/icon-{size}.png")
    icon(size, maskable=True).save(f"public/icons/maskable-{size}.png")
icon(180, maskable=True).convert("RGB").save("public/icons/apple-touch-icon.png")
icon(32).save("public/icons/favicon-32.png")
print("ok")
