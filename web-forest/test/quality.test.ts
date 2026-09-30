import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTO_FRAME_MIN,
  BUDGET,
  isQualityProbeNeeded,
  isSmallDevice,
  parseQuality,
  parseQualityChoice,
  pickQuality,
  qualityFromFrame,
  qualityLabel,
  readMeasured,
  writeMeasured,
} from "../src/quality.ts";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

/* 180 frames at 16.7 ms is just over `AUTO_SAMPLE_MS`. */
const frame = (ms: number, n = 180) => Array.from({ length: n }, () => ms);

describe("pickQuality — who decides the graphics tier", () => {
  const big = { core_count: 8, memory_gb: 8 };

  it("lets the URL pin it over everything", () => {
    assert.deepEqual(pickQuality({ url: "full", choice: "lite", hint: { core_count: 2 }, measured: "lite" }), {
      tier: "full",
      reason: "url",
    });
  });

  it("lets a Settings choice beat auto, even on a small device", () => {
    assert.deepEqual(pickQuality({ url: null, choice: "full", hint: { core_count: 2 }, measured: null }), {
      tier: "full",
      reason: "setting",
    });
  });

  it("starts a small device lite and says why", () => {
    const pick = pickQuality({ url: null, choice: "auto", hint: { core_count: 4, memory_gb: 4 }, measured: null });
    assert.deepEqual(pick, { tier: "lite", reason: "device" });
    assert.equal(isQualityProbeNeeded(pick), false);
  });

  it("remembers a measured drop", () => {
    assert.deepEqual(pickQuality({ url: null, choice: "auto", hint: big, measured: "lite" }), {
      tier: "lite",
      reason: "measured",
    });
  });

  it("starts anything else full, and only then measures", () => {
    const pick = pickQuality({ url: null, choice: "auto", hint: big, measured: null });
    assert.deepEqual(pick, { tier: "full", reason: "default" });
    assert.equal(isQualityProbeNeeded(pick), true);
    assert.equal(isQualityProbeNeeded({ tier: "full", reason: "setting" }), false);
  });
});

describe("isSmallDevice — the hint", () => {
  it("reads two cores or 2 GB as small", () => {
    assert.equal(isSmallDevice({ core_count: 2 }), true);
    assert.equal(isSmallDevice({ memory_gb: 2 }), true);
    assert.equal(isSmallDevice({ core_count: 4, memory_gb: 4 }), true);
  });

  it("does not read four cores alone as small — Safari never reports memory", () => {
    assert.equal(isSmallDevice({ core_count: 4 }), false);
    assert.equal(isSmallDevice({ core_count: 8, memory_gb: 4 }), false);
  });

  it("says nothing when the browser hides the numbers", () => {
    assert.equal(isSmallDevice({}), false);
    assert.equal(isSmallDevice({ core_count: 0, memory_gb: Number.NaN }), false);
  });
});

describe("qualityFromFrame — the measured verdict", () => {
  it("waits for three seconds of moving frames", () => {
    assert.equal(qualityFromFrame(frame(16.7, 150)), null);
    assert.equal(qualityFromFrame(frame(16.7, 180))?.tier, "full");
  });

  it("judges a slow phone on time, not on a frame count it would take ages to fill", () => {
    const verdict = qualityFromFrame(frame(80, 40));
    assert.equal(verdict?.tier, "lite");
    assert.equal(verdict?.fps_p50, 13);
    assert.equal(qualityFromFrame(frame(200, AUTO_FRAME_MIN - 1)), null);
  });

  it("keeps a 60 fps device full", () => {
    assert.equal(qualityFromFrame(frame(16.7))?.tier, "full");
  });

  it("drops a device whose median frame is under 45 fps", () => {
    const verdict = qualityFromFrame(frame(28));
    assert.equal(verdict?.tier, "lite");
    assert.equal(verdict?.fps_p50, 36);
  });

  it("drops a device that is smooth on average but stalls often", () => {
    /* 88% at 60 fps, 12% at 20 fps: the slowest 5% are 20 fps. */
    const delta = [...frame(16.7, 176), ...frame(50, 24)];
    const verdict = qualityFromFrame(delta);
    assert.equal(verdict?.fps_p50, 60);
    assert.equal(verdict?.tier, "lite");
  });

  it("forgives one stray long frame", () => {
    const delta = [...frame(16.7, 199), 120];
    assert.equal(qualityFromFrame(delta)?.tier, "full");
  });

  it("ignores junk samples", () => {
    assert.equal(qualityFromFrame([...frame(16.7), Number.NaN, -1, 0])?.tier, "full");
  });
});

describe("the tier's words and budget", () => {
  it("parses only the two tiers", () => {
    assert.equal(parseQuality("lite"), "lite");
    assert.equal(parseQuality("LITE"), null);
    assert.equal(parseQuality(null), null);
    assert.equal(parseQualityChoice("full"), "full");
    assert.equal(parseQualityChoice("fast"), "auto");
  });

  it("names the tier and the reason on the badge", () => {
    assert.equal(qualityLabel({ tier: "lite", reason: "measured" }), "Lite graphics · auto, measured");
    assert.equal(qualityLabel({ tier: "full", reason: "url" }), "Full graphics · pinned");
  });

  it("lite draws strictly less than full", () => {
    assert.ok(BUDGET.lite.tree_max < BUDGET.full.tree_max);
    assert.ok(BUDGET.lite.tree_radius_m < BUDGET.full.tree_radius_m);
    assert.equal(BUDGET.lite.is_building_shadow, false);
    assert.equal(BUDGET.lite.is_ambient_motion, false);
  });

  it("remembers a measured tier per device", () => {
    const storage = memoryStorage();
    assert.equal(readMeasured(storage), null);
    writeMeasured(storage, "lite");
    assert.equal(readMeasured(storage), "lite");
    assert.equal(readMeasured(null), null);
  });
});
