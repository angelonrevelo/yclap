import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generatedNameOf, nameNoticeOf, nameVerdictOf, safeNameOf } from "../src/name-filter.ts";
import { readPlayer } from "../src/sync.ts";
import { sanitizePlayer } from "../src/campus-world.ts";

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

const refused = (name: string) => !nameVerdictOf(name).is_ok;

describe("the display-name filter refuses", () => {
  it("English and Filipino profanity as plain words", () => {
    for (const name of ["fuck", "Shit Happens", "bitch", "Putangina", "tangina mo", "Gago", "Tanga Ka", "bobo", "ulol", "Tarantado", "kupal", "Puta"]) {
      assert.ok(refused(name), `${name} should be refused`);
    }
  });

  it("slurs, and names posing as the people who run this", () => {
    assert.deepEqual(nameVerdictOf("nigger"), { is_ok: false, reason: "slur" });
    assert.deepEqual(nameVerdictOf("faggot lol"), { is_ok: false, reason: "slur" });
    assert.deepEqual(nameVerdictOf("retard"), { is_ok: false, reason: "slur" });
    assert.deepEqual(nameVerdictOf("Moderator"), { is_ok: false, reason: "reserved" });
    assert.deepEqual(nameVerdictOf("Admin Team"), { is_ok: false, reason: "reserved" });
  });

  it("the evasions: leet, spacing, stretching, stars, accents, full-width, zero-width, look-alikes", () => {
    const evasion = [
      "f u c k",
      "f.u.c.k",
      "F-U-C-K you",
      "fuuuuuck",
      "fvck",
      "f*ck",
      "fück",
      "ｆｕｃｋ",
      "fu​ck",
      "fuсk" /* Cyrillic с */,
      "sh1t",
      "$hit",
      "b1tch",
      "p0ta",
      "put@ngina",
      "tang1na mo",
      "T4NG1N4",
      "G4G0",
      "gaaaago",
      "u1o1" /* 1 read as l */,
      "P U T A",
      "p.u.t.a",
      "pu7angina",
      "TanginaMo",
      "xXtanginaXx",
      "Tangi Na Mo",
      "kan7ot",
      "n1gg3r",
      "f@gg0t",
      "MolaveFuck",
      "fu ck",
    ];
    for (const name of evasion) assert.ok(refused(name), `${JSON.stringify(name)} should be refused`);
  });
});

describe("the display-name filter lets through", () => {
  it("ordinary words, places and names that contain a bad substring", () => {
    const fine = [
      "Batangas Walker" /* tanga */,
      "Putatan" /* puta — a Muntinlupa barangay */,
      "Scunthorpe" /* cunt */,
      "Assumption" /* ass */,
      "Glass Onion",
      "Walk as One" /* "ass" folded is "as" */,
      "Shiitake",
      "Petite" /* tite */,
      "Title Holder" /* titi */,
      "Therapist" /* rapist */,
      "Grape Juice" /* rape */,
      "Retardant" /* retard */,
      "Nazir",
      "Mitsubishi",
      "Tanghalian",
      "Tangi" /* "only, unique" */,
      "Pukyutan" /* beehive */,
      "Kantutay" /* Lantana, a shrub on this campus */,
      "Taranta",
      "Kupang" /* a campus tree, and a generated-name word */,
      "Potato",
      "Cocktail",
      "Analyn",
      "Sussex",
      "Dumaguete",
      "Bobby",
      "Gagamba" /* spider */,
    ];
    for (const name of fine) assert.ok(!refused(name), `${name} should pass`);
  });

  it("real names and words it deliberately does not block", () => {
    for (const name of ["Dick Gordon", "Cum Laude Molave", "Pepe", "Bakla ako", "Leche Flan", "Tae-yang", "Hayop sa ganda", "Lady Gaga", "Ana", "Juan dela Cruz", "María Clara", "Bo Bo"]) {
      assert.ok(!refused(name), `${name} should pass`);
    }
  });

  it("every generated walker name", () => {
    for (let i = 0; i < 2000; i++) {
      const name = generatedNameOf(`player-${i}`);
      assert.ok(!refused(name), `${name} (a generated name) should pass`);
    }
  });
});

describe("a refused name falls back", () => {
  it("to the generated walker name for the same seed — the name that phone was minted with", () => {
    const storage = memoryStorage();
    const me = readPlayer(storage);
    assert.equal(me.name, generatedNameOf(me.player_id), "sync.ts mints through generatedNameOf");
    assert.deepEqual(safeNameOf("G4G0", me.player_id), { name: me.name, refusal: "profanity" });
    assert.deepEqual(safeNameOf("  Ana  ", me.player_id), { name: "Ana", refusal: null });
    assert.deepEqual(safeNameOf("", me.player_id), { name: "Walker", refusal: null });
  });

  it("and the notice says why without repeating the name", () => {
    const notice = nameNoticeOf("profanity", "Molave Walker 8");
    assert.match(notice, /Molave Walker 8/);
    assert.match(notice, /swear/);
    assert.match(nameNoticeOf("slur", "Dao Walker 1"), /slur/);
  });

  it("on /sync too: the world feed prints the fallback", () => {
    const player = sanitizePlayer({ player_id: "p-sync", name: "tangina" });
    assert.equal(player?.name, generatedNameOf("p-sync"));
    assert.equal(sanitizePlayer({ player_id: "p-sync", name: "Ana" })?.name, "Ana");
  });
});
