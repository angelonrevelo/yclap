import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AVATAR_CAP_CLOSE,
  AVATAR_FLOOR,
  avatarPx,
  clampPitch,
  isTickLerpDone,
  tickLerpAt,
  tickLerpNext,
  TICK_LERP_DEFAULT_MS,
  type TickLerp,
  glideStep,
  pitchAfterDrag,
  pitchForZoom,
  PITCH_AT_CLOSE,
  PITCH_AT_WIDE,
  PITCH_DEADZONE_PX,
  PITCH_MAX,
  PITCH_MIN,
  roadCasingPx,
  roadWidthPx,
  type Glide,
} from "../src/camera-feel.ts";

describe("glideStep — the camera eases toward the walker", () => {
  it("arrives at a still target and never overshoots it", () => {
    let g: Glide = { value: 0, velocity: 0 };
    let max = 0;
    for (let i = 0; i < 120; i += 1) {
      g = glideStep(g, 10, 1 / 60);
      max = Math.max(max, g.value);
    }
    assert.ok(max <= 10, `overshot to ${max}`);
    assert.ok(Math.abs(g.value - 10) < 1e-3, `stopped at ${g.value}`);
  });

  it("turns a 20 Hz staircase into a steadier glide than jumping to each step", () => {
    /* The stick publishes a step every 50 ms. Jumping to each step moves the
       camera on one frame in three and not at all on the others; the glide
       should move on every frame with far less spread in per-frame motion. */
    const frame_s = 1 / 60;
    const step_every = 3;
    const step_size = 12;
    let target = 0;
    let g: Glide = { value: 0, velocity: 0 };
    const glide_move: number[] = [];
    const jump_move: number[] = [];
    for (let i = 1; i <= 240; i += 1) {
      const before = g.value;
      const jump_before = target;
      if (i % step_every === 0) target += step_size;
      g = glideStep(g, target, frame_s);
      if (i > 60) {
        glide_move.push(g.value - before);
        jump_move.push(target - jump_before);
      }
    }
    const spread = (a: number[]) => {
      const mean = a.reduce((s, v) => s + v, 0) / a.length;
      return Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / a.length) / mean;
    };
    assert.ok(glide_move.every((m) => m > 0), "glide stalled on a frame");
    assert.ok(spread(glide_move) < spread(jump_move) / 3, `glide ${spread(glide_move)} vs jump ${spread(jump_move)}`);
  });

  it("survives a zero and a huge frame without going non-finite", () => {
    const a = glideStep({ value: 1, velocity: 2 }, 5, 0);
    const b = glideStep({ value: 1, velocity: 2 }, 5, 30);
    for (const g of [a, b]) {
      assert.ok(Number.isFinite(g.value) && Number.isFinite(g.velocity));
    }
    assert.ok(b.value <= 5);
  });
});

describe("pitch", () => {
  it("clamps inside the play band, and NaN rests at the wide pitch", () => {
    assert.equal(clampPitch(10), PITCH_MIN);
    assert.equal(clampPitch(89), PITCH_MAX);
    assert.equal(clampPitch(50), 50);
    assert.equal(clampPitch(Number.NaN), PITCH_AT_WIDE);
  });

  it("tilts more as the camera closes in, flat outside the play band", () => {
    assert.equal(pitchForZoom(19), PITCH_AT_WIDE);
    assert.equal(pitchForZoom(22), PITCH_AT_CLOSE);
    assert.equal(pitchForZoom(15), PITCH_AT_WIDE);
    assert.equal(pitchForZoom(25), PITCH_AT_CLOSE);
    assert.ok(pitchForZoom(20.5) > PITCH_AT_WIDE && pitchForZoom(20.5) < PITCH_AT_CLOSE);
    /* The resting pitch is always a legal pitch. */
    for (let z = 18; z <= 23; z += 0.25) {
      assert.equal(clampPitch(pitchForZoom(z)), pitchForZoom(z));
    }
  });

  it("a two-finger drag up tilts toward the horizon, inside the limits", () => {
    assert.ok(pitchAfterDrag(50, -100) > 50);
    assert.ok(pitchAfterDrag(50, 100) < 50);
    assert.equal(pitchAfterDrag(50, -10_000), PITCH_MAX);
    assert.equal(pitchAfterDrag(50, 10_000), PITCH_MIN);
  });

  it("a pinch that wobbles inside the deadzone does not nod the camera", () => {
    assert.equal(pitchAfterDrag(52, PITCH_DEADZONE_PX), 52);
    assert.equal(pitchAfterDrag(52, -PITCH_DEADZONE_PX), 52);
    /* And just past it the tilt starts from zero, not with a jump. */
    assert.ok(Math.abs(pitchAfterDrag(52, -(PITCH_DEADZONE_PX + 1)) - 52) < 0.5);
  });
});

describe("big roads", () => {
  it("draws walkways at real width at the street camera, roads wider than paths", () => {
    const street = 0.036; // plane m/px at z22 on campus
    const road = roadWidthPx(true, street);
    const path = roadWidthPx(false, street);
    assert.ok(road > path);
    assert.ok(road >= 100, `road only ${road}px at z22`);
    assert.ok(path >= 50, `path only ${path}px at z22`);
    /* Old ribbons were 6 px and 3 px at every zoom. */
    assert.ok(roadWidthPx(true, 0.29) > 6 && roadWidthPx(false, 0.29) > 3);
  });

  it("widens with zoom but is floored and capped", () => {
    assert.ok(roadWidthPx(true, 0.07) > roadWidthPx(true, 0.14));
    assert.equal(roadWidthPx(true, 100), 12);
    assert.equal(roadWidthPx(false, 100), 7);
    assert.equal(roadWidthPx(true, 0.001), 150);
    assert.ok(roadCasingPx(20) > 20);
  });
});

describe("the walker", () => {
  it("takes 22–28% of a phone's short side, not 40% of it", () => {
    /* The playtest phone: 375 px wide. The flat 112–140 px walker was 30–37%
       of it and read as the character eating the map. */
    for (const zoom of [19, 20, 21, 22]) {
      const share = avatarPx(zoom, 375) / 375;
      assert.ok(share >= 0.215 && share <= 0.285, `z${zoom}: ${(share * 100).toFixed(1)}%`);
    }
  });

  it("still grows as the camera closes, and stops growing past the band", () => {
    assert.ok(avatarPx(22, 390) > avatarPx(19, 390));
    assert.ok(avatarPx(21, 390) >= avatarPx(20, 390));
    assert.equal(avatarPx(30, 390), avatarPx(22, 390));
    assert.equal(avatarPx(10, 390), avatarPx(19, 390));
  });

  it("is capped on a big window and floored before the map has a size", () => {
    assert.equal(avatarPx(22, 1080), AVATAR_CAP_CLOSE);
    assert.equal(avatarPx(22, 0), AVATAR_FLOOR);
    assert.equal(avatarPx(Number.NaN, Number.NaN), AVATAR_FLOOR);
  });
});

describe("tick interpolation — the camera between stick ticks", () => {
  const a = { lat: 0, lon: 0 };
  const b = { lat: 0, lon: 1 };
  const c = { lat: 1, lon: 1 };

  it("starts at rest on the first position", () => {
    const s = tickLerpNext(null, a, 1000);
    assert.deepEqual(tickLerpAt(s, 1000), a);
    assert.equal(isTickLerpDone(s, 1000), true);
  });

  it("slides over the cadence the positions arrive at, every frame, not in steps", () => {
    let s: TickLerp = tickLerpNext(null, a, 0);
    s = tickLerpNext(s, b, 50);
    s = tickLerpNext(s, { lat: 0, lon: 2 }, 100);
    assert.equal(s.span_ms, 50);
    /* Four frames inside one tick each move, and by the same amount. */
    const lon = [108, 116, 124, 132].map((t) => tickLerpAt(s, t).lon);
    const step = lon.slice(1).map((v, i) => v - lon[i]);
    for (const d of step) assert.ok(d > 0 && Math.abs(d - step[0]) < 1e-9);
    assert.equal(isTickLerpDone(s, 149), false);
    assert.deepEqual(tickLerpAt(s, 150), { lat: 0, lon: 2 });
  });

  it("bends on a turn instead of jumping: a new target starts from where it is", () => {
    let s: TickLerp = tickLerpNext(null, a, 0);
    s = tickLerpNext(s, b, 50);
    const before = tickLerpAt(s, 75);
    s = tickLerpNext(s, c, 75);
    const after = tickLerpAt(s, 75);
    assert.deepEqual(after, before);
  });

  it("treats a long pause as a fresh walk at the stick's cadence, and clamps odd gaps", () => {
    let s: TickLerp = tickLerpNext(null, a, 0);
    s = tickLerpNext(s, b, 5000);
    assert.equal(s.span_ms, TICK_LERP_DEFAULT_MS);
    s = tickLerpNext(s, c, 5001);
    assert.ok(s.span_ms >= 16);
    s = tickLerpNext(s, a, 5200);
    assert.ok(s.span_ms <= 120);
  });
});
