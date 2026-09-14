"""Chroma-key magenta-ground renders into clean RGBA game icons.

Soft alpha from 'magentaness' (min(R,B) - G), then un-premultiply against the
key so antialiased edges lose their pink spill instead of wearing a fringe.
Trimmed to content and re-padded so every icon has the same optical margin.
"""
import sys, os, json
import numpy as np
from PIL import Image

KEY = np.array([1.0, 0.0, 1.0])
LO, HI = 0.22, 0.80
SIZE, MARGIN = 512, 0.07

def key_one(src, dst):
    im = Image.open(src).convert("RGB")
    c = np.asarray(im).astype(np.float32) / 255.0
    m = np.clip(np.minimum(c[..., 0], c[..., 2]) - c[..., 1], 0, 1)
    t = np.clip((m - LO) / (HI - LO), 0, 1)
    a = 1 - t * t * (3 - 2 * t)
    safe = np.maximum(a, 1e-3)[..., None]
    rgb = np.clip((c - (1 - a)[..., None] * KEY) / safe, 0, 1)
    rgb[a < 0.02] = 0
    ys, xs = np.where(a > 0.05)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([rgb, a])[y0:y1, x0:x1]
    h, w = rgba.shape[:2]
    side = int(max(h, w) / (1 - 2 * MARGIN))
    canvas = np.zeros((side, side, 4), np.float32)
    oy, ox = (side - h) // 2, (side - w) // 2
    canvas[oy:oy + h, ox:ox + w] = rgba
    out = Image.fromarray((canvas * 255).round().astype(np.uint8), "RGBA").resize((SIZE, SIZE), Image.LANCZOS)
    out.save(dst, optimize=True)
    arr = np.asarray(out).astype(np.float32) / 255.0
    al = arr[..., 3]
    residue = int(((al > 0.5) & (arr[..., 0] > 0.75) & (arr[..., 2] > 0.75) & (arr[..., 1] < 0.35)).sum())
    return {"file": os.path.basename(dst), "size": out.size, "opaque_share": round(float((al > 0.98).mean()), 3),
            "partial_share": round(float(((al > 0.02) & (al < 0.98)).mean()), 4), "magenta_residue_px": residue}

def sheet(paths, dst, bg=(38, 36, 33)):
    tile, pad = 200, 12
    cols = 4
    rows = (len(paths) + cols - 1) // cols
    img = Image.new("RGBA", (cols * (tile + pad) + pad, rows * (tile + pad) + pad), bg + (255,))
    for i, p in enumerate(paths):
        icon = Image.open(p).resize((tile, tile), Image.LANCZOS)
        img.alpha_composite(icon, (pad + (i % cols) * (tile + pad), pad + (i // cols) * (tile + pad)))
    img.convert("RGB").save(dst)

if __name__ == "__main__":
    src_dir, dst_dir = sys.argv[1], sys.argv[2]
    os.makedirs(dst_dir, exist_ok=True)
    report, done = [], []
    for f in sorted(os.listdir(src_dir)):
        if not f.endswith(".raw.png"):
            continue
        dst = os.path.join(dst_dir, f.replace(".raw.png", ".png"))
        report.append(key_one(os.path.join(src_dir, f), dst))
        done.append(dst)
    if done:
        sheet(done, os.path.join(dst_dir, "_sheet.png"))
    print(json.dumps(report, indent=1))
