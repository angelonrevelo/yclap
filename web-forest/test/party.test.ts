import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canJoin, cleanPartyCode, isWithHost, newPartyCode, partyMemberOf, partySpecies, partyTagOf, PARTY_LOBBY_MS, PARTY_MAX, type PartyWalker } from "../src/party.ts";
import { sanitizePose, shouldSend } from "../src/multiplayer.ts";
import { CAMPUS_CENTER } from "../src/geo.ts";

/* ── group walks (Gelo 10-01: "make sure multiplayer works well or group walk") ── */

const NOW = 1_800_000_000_000;
const HOST = { ...CAMPUS_CENTER };
const code = "482913";
const tag = partyTagOf(code);
const walker = (over: Partial<PartyWalker>): PartyWalker => ({ walker_id: Math.random().toString(36), name: "W", lat: HOST.lat, lon: HOST.lon, ...over });

describe("party", () => {
  it("a code is six digits; the tag is one-way and differs per code", () => {
    assert.match(newPartyCode(), /^\d{6}$/);
    assert.equal(cleanPartyCode("482 913"), "482913");
    assert.equal(cleanPartyCode("4829"), null);
    assert.match(tag, /^[0-9a-f]{8}$/);
    assert.notEqual(partyTagOf("482914"), tag);
    assert.ok(!tag.includes(code));
  });

  it("join: needs the host out with the tag, an open lobby, room, and you nearby", () => {
    const host = walker({ name: "Host", party_tag: tag, party_since: NOW - 60_000 });
    assert.equal(canJoin(code, [host], HOST, NOW).ok, true);
    assert.equal(canJoin("000000", [host], HOST, NOW).ok, false, "wrong code");
    assert.equal(canJoin(code, [{ ...host, party_since: NOW - PARTY_LOBBY_MS - 1 }], HOST, NOW).ok, false, "lobby closed");
    const full = [host, ...Array.from({ length: PARTY_MAX - 1 }, () => walker({ party_tag: tag }))];
    assert.equal(canJoin(code, full, HOST, NOW).ok, false, "full");
    assert.equal(canJoin(code, [host], { lat: HOST.lat + 0.002, lon: HOST.lon }, NOW).ok, false, "220 m away");
    assert.equal(canJoin(code, [host], null, NOW).ok, false, "no position");
  });

  it("members are the walkers with your tag, host first; credit only within 100 m of the host", () => {
    const host = walker({ name: "Host", party_tag: tag, party_since: NOW });
    const other = walker({ name: "Other", party_tag: "deadbeef" });
    const mate = walker({ name: "Mate", party_tag: tag });
    const member = partyMemberOf([mate, other, host], { code, role: "member", since: NOW });
    assert.deepEqual(member.map((m) => m.name), ["Host", "Mate"]);
    assert.ok(isWithHost({ lat: HOST.lat + 0.0005, lon: HOST.lon }, HOST));
    assert.ok(!isWithHost({ lat: HOST.lat + 0.0015, lon: HOST.lon }, HOST));
  });

  it("the group's species count only finds since the group started", () => {
    const party = { code, role: "host" as const, since: NOW };
    const got = partySpecies(
      party,
      new Set(["wA"]),
      [
        { walker_id: "wA", species_code: "narra", created_at: new Date(NOW + 1000).toISOString() },
        { walker_id: "wA", species_code: "dao", created_at: new Date(NOW - 1000).toISOString() },
        { walker_id: "wZ", species_code: "molave", created_at: new Date(NOW + 1000).toISOString() },
      ],
      [{ species_code: "katmon", created_at: new Date(NOW + 5000).toISOString() }],
    );
    assert.deepEqual([...got].sort(), ["katmon", "narra"]);
  });

  it("the hall carries the tag and the host's start, refuses a malformed tag or an impossible start", () => {
    const base = { player_id: "p-1234567890", name: "Ana", level: 2, stage: "egg", lat: HOST.lat, lon: HOST.lon, source: "gps" };
    const pose = sanitizePose({ ...base, party_tag: tag, party_since: NOW - 1000 }, NOW);
    assert.equal(pose?.party_tag, tag);
    assert.equal(pose?.party_since, NOW - 1000);
    assert.equal(sanitizePose({ ...base, party_tag: "<script>" }, NOW)?.party_tag, undefined);
    assert.equal(sanitizePose({ ...base, party_tag: tag, party_since: NOW + 3_600_000 }, NOW)?.party_since, undefined);
  });

  it("joining or leaving sends a pose at once, not at the next heartbeat", () => {
    const last = { lat: HOST.lat, lon: HOST.lon, level: 1, stage: "egg", name: "A", at: NOW - 1500 };
    assert.equal(shouldSend(last, { lat: HOST.lat, lon: HOST.lon, level: 1, stage: "egg", name: "A" }, NOW), false);
    assert.equal(shouldSend(last, { lat: HOST.lat, lon: HOST.lon, level: 1, stage: "egg", name: "A", party_tag: tag }, NOW), true);
  });
});
