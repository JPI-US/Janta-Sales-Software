from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = Path(
    r"C:\Users\seans\.cursor\projects\c-Users-seans-OneDrive-Desktop-Everything-Everywhere-All-at-Once-Cursor-Janta-Sales-Software\assets"
)
ORIGINAL = next(ASSET_DIR.glob("*Logo_1_Mix1*"), None)
DST = ROOT / "public" / "assets" / "janta-logo-mix1.png"


def is_background(r, g, b, a, tolerance=28):
    if a < 16:
        return True
    return r > 255 - tolerance and g > 255 - tolerance and b > 255 - tolerance


def flood_transparent(img, tolerance=28):
    w, h = img.size
    px = img.load()
    seen = bytearray(w * h)
    q = deque()

    def push(x, y):
        idx = y * w + x
        if seen[idx]:
            return
        r, g, b, a = px[x, y]
        if not is_background(r, g, b, a, tolerance):
            return
        seen[idx] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        if x > 0:
            push(x - 1, y)
        if x < w - 1:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y < h - 1:
            push(x, y + 1)

    return img


def main():
    src = ORIGINAL if ORIGINAL and ORIGINAL.exists() else DST
    img = Image.open(src).convert("RGBA")
    img = flood_transparent(img, tolerance=32)

    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    pad = 4
    canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad), img)
    canvas.save(DST)
    print(f"saved {DST} from {src.name} size={canvas.size}")


if __name__ == "__main__":
    main()
