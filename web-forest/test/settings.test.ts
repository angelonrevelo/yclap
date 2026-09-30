import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ESSAY,
  LIMIT,
  PARTNER,
  STAGE_LADDER,
  STAGE_NOW,
} from "../src/settings-content.ts";
import {
  PREFERENCE_DEFAULT,
  isHapticEnabled,
  readPreference,
  setHapticEnabled,
  writePreference,
} from "../src/preference.ts";

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

describe("what the settings screen claims", () => {
  it("says alpha, and alpha is the first rung", () => {
    assert.equal(STAGE_NOW, "alpha");
    assert.equal(STAGE_LADDER[0].key, "alpha");
  });

  it("never claims a partnership nobody has agreed to", () => {
    /* The load-bearing test on this screen.
     *
     * The Working Doc's first objective is explicit: "Record who answered and
     * who did not. Do not claim '20 representatives consulted' until that
     * number is real." A settings page listing six Ateneo offices is one
     * careless boolean away from making exactly that claim to every student who
     * opens it. If somebody flips one of these to true, they should have to
     * delete this test on purpose. */
    for (const row of PARTNER) {
      assert.equal(
        row.is_confirmed,
        false,
        `${row.short} is marked as an agreed partner. If an office has genuinely agreed, ` +
          `update this test with what they agreed to and when.`,
      );
    }
  });

  it("names a real ask for every office, not a placeholder", () => {
    for (const row of PARTNER) {
      assert.ok(row.ask.length > 40, `${row.short}'s ask is too thin to be real`);
      assert.ok(row.name.length > 0 && row.short.length > 0);
    }
  });

  it("keeps the limits on the same screen as the pitch", () => {
    assert.ok(LIMIT.length >= 3);
    const all = LIMIT.join(" ").toLowerCase();
    /* The three a student is most likely to be misled by. */
    assert.ok(all.includes("survey"), "does not say it is not a survey");
    assert.ok(all.includes("this phone") || all.includes("device"), "does not say where data lives");
    assert.ok(all.includes("not an official"), "does not disclaim official status");
  });

  it("sources the essay beat that carries a number", () => {
    const numeric = ESSAY.filter((b) => /\d/.test(b.body));
    assert.ok(numeric.length > 0, "no essay beat states a figure at all");
    for (const beat of numeric) {
      assert.ok(
        beat.source && beat.source.length > 0,
        `"${beat.heading}" states a figure with no source`,
      );
    }
  });

  it("gives every rung on the ladder a blurb that says what changes", () => {
    for (const row of STAGE_LADDER) {
      assert.ok(row.blurb.length > 60, `${row.label} has no real description`);
    }
  });
});

describe("preference", () => {
  it("returns the default on a cold device", () => {
    assert.deepEqual(readPreference(memoryStorage()), PREFERENCE_DEFAULT);
  });

  it("round-trips", () => {
    const storage = memoryStorage();
    writePreference({ ...PREFERENCE_DEFAULT, is_haptic: false, skyline_style: "solid" }, storage);
    const back = readPreference(storage);
    assert.equal(back.is_haptic, false);
    assert.equal(back.skyline_style, "solid");
  });

  it("keeps a student visible on the live map unless they explicitly hide, and remembers when they do", () => {
    assert.equal(PREFERENCE_DEFAULT.is_hidden_from_hall, false);
    const storage = memoryStorage();
    storage.setItem("field-guide.preference", JSON.stringify({ is_hidden_from_hall: "yes" }));
    assert.equal(readPreference(storage).is_hidden_from_hall, false, "only a real true hides");
    writePreference({ ...PREFERENCE_DEFAULT, is_hidden_from_hall: true }, storage);
    assert.equal(readPreference(storage).is_hidden_from_hall, true);
  });

  it("refuses a skyline style that is not one of the four", () => {
    const storage = memoryStorage();
    storage.setItem("field-guide.preference", JSON.stringify({ skyline_style: "wireframe" }));
    assert.equal(readPreference(storage).skyline_style, PREFERENCE_DEFAULT.skyline_style);
  });

  it("survives a corrupted store rather than throwing on boot", () => {
    const storage = memoryStorage();
    storage.setItem("field-guide.preference", "{{{");
    assert.deepEqual(readPreference(storage), PREFERENCE_DEFAULT);
  });

  it("mirrors the haptic flag into the cache the pointer path reads", () => {
    setHapticEnabled(false);
    assert.equal(isHapticEnabled(), false);
    setHapticEnabled(true);
    assert.equal(isHapticEnabled(), true);
  });
});
