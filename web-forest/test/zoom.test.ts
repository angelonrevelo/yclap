import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampZoom,
  easeZoom,
  isZoomSettled,
  pinchZoomDelta,
  quantizeZoom,
  tileZoomOf,
  wheelZoomStep,
  ZOOM_BUTTON_DELTA,
  ZOOM_EASE,
  zoomScaleOf,
} from "../src/zoom.ts";

describe("fractional zoom", () => {
  it("draws tiles at a whole level and carries the rest as a scale", () => {
    assert.equal(tileZoomOf(19.0), 19);
    assert.equal(zoomScaleOf(19.0), 1);
    assert.equal(tileZoomOf(19.3), 19);
    assert.ok(Math.abs(zoomScaleOf(19.3) - 2 ** 0.3) < 1e-12);
  });

  it("never stretches a tile more than about 41%", () => {
    /* Rounding rather than flooring is what bounds this. Flooring would let a
       tile be drawn at 2x, where upscaling reads as blur rather than as zoom. */
    for (let z = 15; z <= 22; z += 0.01) {
      const scale = zoomScaleOf(z);
      assert.ok(scale >= 1 / Math.SQRT2 - 1e-9, `scale ${scale} at z${z}`);
      assert.ok(scale <= Math.SQRT2 + 1e-9, `scale ${scale} at z${z}`);
    }
  });

  it("agrees with the old integer behaviour at whole levels", () => {
    for (const z of [15, 17, 19, 20, 22]) {
      assert.equal(tileZoomOf(z), z);
      assert.equal(zoomScaleOf(z), 1);
    }
  });

  it("is continuous across a tile-level boundary", () => {
    /* The scale must not jump where the tile level flips — that discontinuity
       IS the staircase this replaces. Approaching 19.5 from below the tiles are
       z19 stretched to √2; just above, they are z20 shrunk to 1/√2, and both
       cover the same ground. */
    const below = zoomScaleOf(19.49) * 2 ** 19;
    const above = zoomScaleOf(19.51) * 2 ** 20;
    assert.ok(Math.abs(below - above) / below < 0.03, `${below} vs ${above}`);
  });
});

describe("easing", () => {
  it("closes a fixed fraction of the gap each frame", () => {
    const next = easeZoom(19, 20);
    assert.ok(Math.abs(next - (19 + ZOOM_EASE)) < 0.01, `got ${next}`);
  });

  it("always returns a number — there is no frame it can skip", () => {
    /* The whole point of the port. tripi's `cee3a12` was a frame loop with an
       early `return` that skipped requestAnimationFrame when the cursor sat
       exactly on the container centre, and the zoom froze mid-gesture. A total
       function cannot have that bug. */
    for (const [current, goal] of [
      [19, 19],
      [19, 22],
      [22, 15],
      [0, 0],
      [-5, 5],
      [19.999, 20],
    ]) {
      const out = easeZoom(current, goal);
      assert.equal(typeof out, "number");
      assert.ok(Number.isFinite(out), `${current} -> ${goal} gave ${out}`);
    }
  });

  it("converges in a sane number of frames, and lands exactly", () => {
    let z = 15;
    let frame = 0;
    while (!isZoomSettled(z, 22) && frame < 200) {
      z = easeZoom(z, 22);
      frame += 1;
    }
    assert.ok(frame < 40, `took ${frame} frames to cross seven levels`);
    assert.equal(z, 22, "never lands exactly on the goal");
  });

  it("does not stop one frame short of where it was sent", () => {
    /* The knife-edge. `easeZoom` snapped when the NEXT value was within the
       threshold; `isZoomSettled` asked about the CURRENT one, so with both at
       0.02 the float gap at 21.98 (0.019999999999999574) ended the gesture a
       fiftieth of a level early, every single time. Settling on exact equality
       removes the race rather than retuning it. */
    let z = 15;
    for (let i = 0; i < 200 && !isZoomSettled(z, 22); i += 1) z = easeZoom(z, 22);
    assert.equal(z, 22);
    assert.ok(!isZoomSettled(21.98, 22), "21.98 must not count as arrived at 22");
  });

  it("settles rather than creeping forever", () => {
    /* The settle threshold must clear the equilibrium where the easing step and
       the two-place quantisation cancel, or the loop never converges at all —
       the first value tried here stalled it 0.03 short of the goal, forever. */
    assert.equal(easeZoom(19.999, 20), 20);
    let z = 15;
    for (let i = 0; i < 500; i += 1) {
      if (isZoomSettled(z, 22)) break;
      z = easeZoom(z, 22);
    }
    assert.ok(isZoomSettled(z, 22), `stalled at ${z}`);
    assert.ok(isZoomSettled(20, 20));
    assert.ok(!isZoomSettled(19, 20));
  });

  it("is monotonic toward the goal, from either side", () => {
    let up = 15;
    for (let i = 0; i < 30; i += 1) {
      const next = easeZoom(up, 20);
      assert.ok(next >= up, `went backwards: ${up} -> ${next}`);
      up = next;
    }
    let down = 22;
    for (let i = 0; i < 30; i += 1) {
      const next = easeZoom(down, 17);
      assert.ok(next <= down, `went backwards: ${down} -> ${next}`);
      down = next;
    }
  });

  it("quantises to two places, so the transform string stays stable", () => {
    assert.equal(quantizeZoom(19.123456), 19.12);
    assert.equal(quantizeZoom(19.129), 19.13);
  });
});

describe("wheel", () => {
  it("scrolls up to zoom in", () => {
    assert.ok(wheelZoomStep(-100) > 0);
    assert.ok(wheelZoomStep(100) < 0);
  });

  it("moves a fraction of a level per tick, not a whole one", () => {
    /* The staircase was one whole level per tick: a 2x jump, a thrown-away tile
       set, and a visible lurch. */
    assert.ok(Math.abs(wheelZoomStep(-100)) < 1, `${wheelZoomStep(-100)} levels per tick`);
    assert.ok(Math.abs(wheelZoomStep(-100)) > 0.05, "too small to feel");
  });

  it("caps one flick of a free-spinning wheel", () => {
    /* deltaY varies wildly by device and deltaMode; an uncapped 3000 would ask
       for thirteen levels from a single event. */
    assert.equal(wheelZoomStep(-4000), wheelZoomStep(-120));
    assert.ok(Math.abs(wheelZoomStep(-4000)) < 1);
  });
});

describe("pinch", () => {
  it("reads a doubled finger spread as exactly one level", () => {
    /* log2, because zoom IS log2 scale. A linear mapping feels fast when the
       fingers are close and dead when they are wide. */
    assert.equal(pinchZoomDelta(100, 200), 1);
    assert.equal(pinchZoomDelta(100, 50), -1);
    assert.equal(pinchZoomDelta(100, 100), 0);
  });

  it("is scale-free — the same ratio means the same thing at any spread", () => {
    assert.ok(Math.abs(pinchZoomDelta(40, 80) - pinchZoomDelta(300, 600)) < 1e-12);
  });

  it("refuses a degenerate spread instead of returning Infinity", () => {
    assert.equal(pinchZoomDelta(0, 100), 0);
    assert.equal(pinchZoomDelta(100, 0), 0);
  });
});

describe("clamping", () => {
  it("holds the camera inside its band", () => {
    assert.equal(clampZoom(30, 19, 22), 22);
    assert.equal(clampZoom(2, 19, 22), 19);
    assert.equal(clampZoom(20.4, 19, 22), 20.4);
  });

  it("survives a NaN rather than propagating it into the transform", () => {
    assert.equal(clampZoom(Number.NaN, 19, 22), 19);
    assert.equal(clampZoom(Number.POSITIVE_INFINITY, 19, 22), 22);
  });

  it("gives the buttons a fractional step, so they cannot re-snap the camera", () => {
    assert.ok(ZOOM_BUTTON_DELTA > 0 && ZOOM_BUTTON_DELTA < 1);
  });
});
