---
name: watermark-removal
description: Remove burned-in stock-asset watermarks (diagonal X lattice patterns) from PDFs containing rasterized line-art images. Use for Canva/Freepik-style PDFs where a repeating watermark pattern is visible across illustrations as cuts in alpha and dark marks in RGB. Triggers include "remove watermark from PDF", "clean stock asset watermark", "watermark X pattern", "Canva watermark cleanup".
---

# watermark-removal

Strip burned-in stock-asset watermarks from PDFs whose visible art is composed of embedded raster images (each with an SMask for soft alpha). Designed for the common case where a vendor (Canva, Freepik, stock-illustration sites) burns a diagonal-X lattice into both the RGB and the SMask of every illustration.

This skill reflects an iteration that took ~18 attempts to get right. **Read the "fundamental insight" section before writing any code.** Most obvious approaches (morphological closing, alpha-domain inpainting) fail in ways that are not visible until you compare side-by-side at 8x zoom. The algorithm below is principled, not a parameter fit.

## When this applies

The target watermark has these properties:

1. The PDF is composed of N embedded raster images (`page.get_images()`), each with its own SMask.
2. Each image is dominated by a single color (line art / monochrome illustration on transparent background).
3. The watermark appears as a regular **X-shaped lattice** at fixed orientations (typically 45° + 135°) across every image.
4. In the **RGB** stream: watermark pixels are darker than the dominant color but the same hue (e.g. dominant `(139,36,31)` → watermark `(84,22,19)`).
5. In the **SMask**: thin diagonal cuts to alpha=0 along the same lattice, so the page background shows through the art.

If those don't all hold, this skill probably won't help. Verify with `inspect_pdf.py` first (below).

## Fundamental insight (the thing that took 18 tries)

> **Detect from RGB. Repair in alpha. Never repair from alpha alone.**

PDF SMask is applied at compositing time. The RGB stream is independent and **still carries the entire watermark X lattice** even at pixels where the SMask was cut to alpha=0. That gives you a global, high-SNR detection signal (~80-unit color distance from the dominant color, against an art body that has zero color variance).

Every alpha-domain approach (closing, dilation, erosion, "between two opaque pixels", path-mostly-low-alpha, etc.) fails for the same structural reason: a watermark cut through art and a natural ray tip both look like "alpha drops near opacity" — they're locally indistinguishable. Any kernel that closes one closes the other. You will play whack-a-mole forever.

The signal you need is non-local: *was this pixel originally watermark-colored*. That signal lives in RGB.

## Algorithm

For each embedded image:

1. **Identify the dominant art color** — `Counter` over RGB values where alpha > 100, take the most common.
2. **Detect the watermark on opaque art** — `wm_strict = (||rgb - dom||₂ > 30) & (alpha > 200)`. This isolates the watermark X-marks burned into the art body. Save this as PNG and **visually verify** it forms a clean diagonal X-grid before going further. If it doesn't, your assumptions are wrong; stop.
3. **Extend the lattice along each diagonal direction** — for each direction `d ∈ {(1,1), (1,-1)}`, compute `on_line[d] = OR(shift(wm_strict, ±i*d) for i in 0..LATTICE_K)`. This covers the alpha-cut zones (where wm_strict is empty because alpha=0).
4. **For each pixel on the lattice with low alpha, check perpendicular bracketing** — opacity must exist within `PERP_K` on **both** perpendicular sides. The perpendicular of `(1,1)` is `(1,-1)` and vice versa.
5. **Bridge alpha** to 255 only where `(on_line[d] & bracketed[d])` for some `d` AND original alpha < 50.
6. **Recolor RGB** — set RGB to dominant color wherever the new alpha is > 200. This kills the dark watermark color on the art body.

## Critical parameter: PERP_K

This is the only parameter that matters and the only one that broke previous versions.

`PERP_K` must equal **half the cut width**, not "max bridge distance". The watermark cut in the SMask is typically 1-3 pixels wide, so `PERP_K = 2` covers cuts up to 4 pixels wide.

If you set `PERP_K` too large (5+), the bracketing test will succeed across the **gap between parallel art features** (chevron bands, double-stroke borders, scallop band gaps). The algorithm will then fill in transparent gaps that are part of the artwork, producing visible artifacts inside the gaps. This is exactly what failed in v17 of the iteration.

| PERP_K | Bridges cuts up to | Risk |
|---|---|---|
| 2 | 4 px wide | safe; matches typical cut width — **default** |
| 3 | 6 px wide | OK if cuts are wider than usual |
| 4 | 8 px wide | starts spanning gaps between thin parallel art lines |
| 6+ | 12+ px wide | bridges chevron band gaps → visible artifacts inside bands |

`LATTICE_K = 6` covers along-line extent of cuts; not sensitive — anywhere from 4 to 10 works. Other thresholds (RGB_DIST=30, ALPHA_OPAQUE=200, ALPHA_HOLE=50) are robust.

## Reference implementation

`remove_watermark.py`:

```python
"""Remove diagonal-X watermark from PDF embedded images.

Algorithm: detect via RGB distance from dominant color (per oracle's insight
that the watermark is fully visible in RGB even where alpha=0), then bridge
alpha cuts only along the detected lattice, perpendicular to the line direction,
only where bracketed by opacity within PERP_K pixels.
"""
import argparse
import shutil
from collections import Counter
from pathlib import Path

import fitz
import numpy as np
from PIL import Image

# Tuned parameters (see SKILL.md for rationale)
RGB_DIST = 30        # color-distance threshold: dominant vs darker watermark
LATTICE_K = 6        # along-line dilation distance to cover cut span
PERP_K = 2           # CRITICAL: half-cut-width. Too large → spans art gaps.
ALPHA_OPAQUE = 200
ALPHA_HOLE = 50


def shift(arr: np.ndarray, dy: int, dx: int) -> np.ndarray:
    """Pad-shift a 2D array by (dy, dx). Out-of-bounds = 0."""
    h, w = arr.shape
    out = np.zeros_like(arr)
    if dy >= 0:
        src_y, dst_y = slice(dy, h), slice(0, h - dy)
    else:
        src_y, dst_y = slice(0, h + dy), slice(-dy, h)
    if dx >= 0:
        src_x, dst_x = slice(dx, w), slice(0, w - dx)
    else:
        src_x, dst_x = slice(0, w + dx), slice(-dx, w)
    out[dst_y, dst_x] = arr[src_y, src_x]
    return out


def watermark_repair(rgb: np.ndarray, mask: np.ndarray):
    """Return (new_rgb, new_mask, dominant_color) for one image.

    rgb: HxWx3 uint8. mask: HxW uint8 (smask, 255 = opaque).
    """
    visible = rgb[mask > 100]
    if len(visible) == 0:
        return rgb, mask, None
    dom = np.array(Counter(map(tuple, visible)).most_common(1)[0][0])

    # 1. Detect watermark on opaque art (RGB-based, not alpha-based)
    dist = np.linalg.norm(rgb.astype(np.float32) - dom.astype(np.float32), axis=2)
    wm_strict = (dist > RGB_DIST) & (mask > 200)

    # 2. Extend along each diagonal to cover alpha-cut zones
    def on_line(direction):
        dy, dx = direction
        on = wm_strict.copy()
        for i in range(1, LATTICE_K + 1):
            on |= shift(wm_strict, -i * dy, -i * dx)
            on |= shift(wm_strict, i * dy, i * dx)
        return on

    on_45 = on_line((1, 1))     # 45° watermark line (NW-SE)
    on_135 = on_line((1, -1))   # 135° watermark line (NE-SW)

    # 3. Perpendicular bracketing: opacity within PERP_K on BOTH sides
    def both_sides_opaque(perp_direction):
        dy, dx = perp_direction
        plus = np.zeros(mask.shape, dtype=bool)
        minus = np.zeros(mask.shape, dtype=bool)
        for i in range(1, PERP_K + 1):
            plus |= shift(mask, -i * dy, -i * dx) > ALPHA_OPAQUE
            minus |= shift(mask, i * dy, i * dx) > ALPHA_OPAQUE
        return plus & minus

    bracketed_45 = both_sides_opaque((1, -1))   # perp of 45° is 135°
    bracketed_135 = both_sides_opaque((1, 1))   # perp of 135° is 45°

    fillable = (on_45 & bracketed_45) | (on_135 & bracketed_135)
    update = (mask < ALPHA_HOLE) & fillable

    new_mask = mask.copy()
    new_mask[update] = 255

    new_rgb = rgb.copy()
    new_rgb[new_mask > 200] = dom

    return new_rgb, new_mask, dom


def process_pdf(input_path: Path, output_path: Path) -> int:
    """Process all embedded images in input_path. Return count modified."""
    work_path = output_path.with_suffix(".work.pdf")
    shutil.copy(input_path, work_path)

    doc = fitz.open(work_path)
    xref_to_smask = {}
    for page in doc:
        for img_info in page.get_images(full=True):
            xref_to_smask[img_info[0]] = img_info[1]

    processed = 0
    for xref, smask_xref in xref_to_smask.items():
        pix = fitz.Pixmap(doc, xref)
        rgb = np.array(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))

        if not smask_xref:
            # No alpha mask — just flat-color the RGB to dominant
            visible = rgb.reshape(-1, 3)
            dom = np.array(Counter(map(tuple, visible)).most_common(1)[0][0])
            rgb_new = np.full_like(rgb, dom)
            doc.update_stream(xref, rgb_new.tobytes(), compress=True)
            processed += 1
            continue

        mpix = fitz.Pixmap(doc, smask_xref)
        mask_arr = np.array(Image.frombytes("L", (mpix.width, mpix.height), mpix.samples))
        if mask_arr.shape != rgb.shape[:2]:
            continue  # size mismatch, skip

        new_rgb, new_mask, dom = watermark_repair(rgb, mask_arr)
        if dom is None:
            continue

        doc.update_stream(xref, new_rgb.tobytes(), compress=True)
        doc.update_stream(smask_xref, new_mask.tobytes(), compress=True)
        processed += 1

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    work_path.unlink()
    return processed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    n = process_pdf(args.input, args.output)
    print(f"Processed {n} images. Output: {args.output}")


if __name__ == "__main__":
    main()
```

## Verification helpers

`inspect_pdf.py` — confirm the watermark fits the assumptions before running the cleaner:

```python
"""Inspect embedded images. Use BEFORE removing watermarks to confirm assumptions."""
import sys
from collections import Counter
from pathlib import Path

import fitz
import numpy as np
from PIL import Image


def inspect(pdf_path: Path):
    doc = fitz.open(pdf_path)
    xref_to_smask = {}
    for page in doc:
        for img_info in page.get_images(full=True):
            xref_to_smask[img_info[0]] = img_info[1]

    print(f"{len(xref_to_smask)} embedded images")
    out_dir = Path("/tmp/wm_inspect")
    out_dir.mkdir(exist_ok=True)

    for i, (xref, smask) in enumerate(list(xref_to_smask.items())[:5]):
        pix = fitz.Pixmap(doc, xref)
        rgb = np.array(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))

        if not smask:
            print(f"xref={xref}: no SMask")
            continue

        mpix = fitz.Pixmap(doc, smask)
        mask = np.array(Image.frombytes("L", (mpix.width, mpix.height), mpix.samples))

        visible = rgb[mask > 100]
        if len(visible) == 0:
            continue
        dom = np.array(Counter(map(tuple, visible)).most_common(1)[0][0])
        dist = np.linalg.norm(rgb.astype(np.float32) - dom.astype(np.float32), axis=2)
        wm = (dist > 30) & (mask > 200)

        n_wm = int(wm.sum())
        print(f"xref={xref} size={rgb.shape[:2]} dom={tuple(dom)} wm_strict={n_wm} px")
        Image.fromarray((wm * 255).astype(np.uint8)).save(out_dir / f"wm_{xref}.png")

    print(f"\nLattice masks saved to {out_dir}/. Open them.")
    print("Each should look like a regular DIAGONAL X-GRID. If it looks like noise")
    print("or solid blocks or random scatter, the assumptions don't hold.")


if __name__ == "__main__":
    inspect(Path(sys.argv[1]))
```

## Workflow

```bash
# 1. Always keep originals
cp Signature.pdf Signature_original.pdf

# 2. Sanity-check the watermark structure
python3 inspect_pdf.py Signature_original.pdf
# → open /tmp/wm_inspect/wm_*.png and confirm each is a clean diagonal X-grid
# If it isn't, STOP. Don't run the cleaner. Reassess.

# 3. Run the cleaner
python3 remove_watermark.py Signature_original.pdf Signature_clean.pdf

# 4. Render both at high zoom for QA
python3 -c "
import fitz
for name in ['Signature_original.pdf', 'Signature_clean.pdf']:
    doc = fitz.open(name)
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(6, 6))
        pix.save(f'{name}_p{i+1}.png')
"

# 5. Inspect rendered pages, especially:
#    - Wavy/scallop frames: should be CONTINUOUS, no cuts
#    - Asterisks/sparkles: should NOT have specks or wisps on rays
#    - Chevron/double-stroke bands: GAP BETWEEN parallel lines must be EMPTY
#    - Diagonal scallop bands: same — no dashes inside the band
```

## Failed approaches — DO NOT TRY

These were all tested. They fail for the same structural reason (alpha-domain ambiguity between watermark cuts and natural boundaries). They produce different artifacts but are equivalent in being unfixable.

- **Grayscale closing on the SMask** (any kernel size). Bridges cuts but extends opacity outward at line tips, creating bumps perpendicular to lines.
- **Diagonal structuring elements**. Same; produces diagonal bumps at line tips.
- **Local-mean / erosion-of-closed gating**. Helps slightly. Still bumps.
- **"Between two opaque pixels" 4-axis test on alpha alone**. Better than closing but creates edge texture/specks on thin features (asterisk rays).
- **Final closing(3) smoothing pass**. Makes asterisks blocky.
- **Path-mostly-low-alpha refinement**. Scratchy noisy edges.
- **FFT periodicity / template matching for X centers**. Overkill; RGB detection gives you the full line for free.
- **AI inpainting (LaMa, OpenCV INPAINT_TELEA)**. Heavy install for a deterministic problem. Save for genuine failures.
- **Render-then-inpaint at page level**. Loses vector text + bakes background. Throws away the per-image surgery.

## Pitfalls

- **Don't process the SMask as if it's the source of truth.** It isn't — RGB is. The SMask gives you cuts; the RGB gives you the full lattice.
- **Don't trust morphology to disambiguate.** It can't. The signal isn't there.
- **Don't process images without an SMask the same way.** They have no alpha cuts; just flat-color the RGB to the dominant color (the cleaner does this).
- **Don't skip the visual verification of `wm_strict`.** If the lattice mask looks wrong, the algorithm will produce garbage. The whole approach depends on RGB detection being clean.
- **Don't tune PERP_K up to fix missed cuts.** It will re-introduce gap-spanning artifacts that are much worse. Cuts you can't bridge with PERP_K=2 are wider than the watermark and probably not actually watermark.
- **Don't forget `garbage=4, deflate=True` on save.** Otherwise the output PDF carries old image streams and balloons.

## Dependencies

```bash
pip install pymupdf pillow numpy
```

No OpenCV, no scipy, no AI models. Pure numpy + PIL + fitz.

## When this skill won't work

- Watermark is a logo/text rather than a repeating lattice → use template-matching or AI inpainting instead.
- Art is photographic / multi-color → dominant color detection breaks; this skill assumes line art with one dominant color per image.
- Watermark color is identical to art color (impossible to detect from RGB) → fall back to alpha-only methods, accepting bumps.
- PDF doesn't use embedded images (vector-only) → different problem entirely; this skill doesn't apply.
- Watermark and art share the same orientation closely (e.g. art is itself a 45° hatch) → RGB detection still works but bracketing may misfire; reduce LATTICE_K and PERP_K both.
