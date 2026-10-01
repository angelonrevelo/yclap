import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import {
  isSiteCode,
  judgeClaim,
  plausibilityFlag,
  sanitizeClaim,
  sanitizeQuestDraft,
  siteCodeAt,
  SITE_CODE_MISS_MAX,
  SITE_CODE_STEP_MS,
  type Quest,
  type QuestClaimInput,
} from "../src/quest.ts";
import type { SqlRun } from "../worker/account.ts";
import { QuestService, type SessionLookup } from "../worker/quest.ts";

/* ── SEEDS challenges (Gelo 10-01: "challenges to students and that noone can cheat") ──
 *
 * The phone claims; the server judges. Every test here is a way someone would
 * try to cheat, or a way an honest student must not be refused.
 */

const TOKEN = "seeds-office:token-of-at-least-16";
const T0 = Date.parse("2026-10-10T02:00:00Z");
const SITE = { lat: 14.6386, lon: 121.0759, radius_m: 30, name: "the pond" };

const quest = (over: Partial<Quest> = {}): Quest => ({
  quest_code: "q-test",
  title: "Pond life",
  brief: "",
  quest_kind: "log_any",
  species_code: [],
  site: SITE,
  start_at: new Date(T0 - 3600_000).toISOString(),
  end_at: new Date(T0 + 3600_000).toISOString(),
  point: 50,
  is_site_code: false,
  is_photo: false,
  class_code: null,
  author: "seeds",
  created_at: new Date(T0 - 7200_000).toISOString(),
  status: "open",
  ...over,
});

/** A walk to the pond: a few real-looking fixes, jittering, at walking pace. */
const walkPath = (end = SITE, at = T0) =>
  Array.from({ length: 6 }, (_, i) => ({
    lat: end.lat - (5 - i) * 0.00004 + (i % 2) * 0.000003,
    lon: end.lon + (i % 3) * 0.000002,
    accuracy_m: 8,
    at: at - (5 - i) * 4000,
  }));

const claim = (over: Partial<QuestClaimInput> = {}): QuestClaimInput => ({
  quest_code: "q-test",
  player_id: "player-aaaaaaaa",
  display_name: "Ana",
  species_code: "molave",
  lat: SITE.lat,
  lon: SITE.lon,
  accuracy_m: 8,
  fix_source: "gps",
  site_code: null,
  has_photo: true,
  path: walkPath(),
  ...over,
});

const ctx = (over: Partial<Parameters<typeof judgeClaim>[2]> = {}) => ({ now_ms: T0, is_site_code_ok: true, last_claim: null, strike_count: 0, ...over });

describe("quest rules: what a claim must carry", () => {
  it("an honest claim at the site on GPS is accepted", () => {
    assert.deepEqual(judgeClaim(quest(), claim(), ctx()), { status: "accepted", reason: [] });
  });

  it("a stick walk or the demo loop cannot claim", () => {
    assert.equal(judgeClaim(quest(), claim({ fix_source: "play" }), ctx()).status, "refused");
    assert.equal(judgeClaim(quest(), claim({ fix_source: "demo" }), ctx()).status, "refused");
  });

  it("outside the geofence is refused, the fix's accuracy allowed for", () => {
    const far = { lat: SITE.lat + 0.0009, lon: SITE.lon }; // ~100 m
    assert.equal(judgeClaim(quest(), claim(far), ctx()).status, "refused");
    const edge = { lat: SITE.lat + 0.0003, lon: SITE.lon, accuracy_m: 10 }; // ~33 m, radius 30 + 10
    assert.equal(judgeClaim(quest(), claim(edge), ctx()).status, "accepted");
  });

  it("before the window, after it, or once closed: refused", () => {
    assert.equal(judgeClaim(quest(), claim(), ctx({ now_ms: T0 + 2 * 3600_000 })).status, "refused");
    assert.equal(judgeClaim(quest({ status: "closed" }), claim(), ctx()).status, "refused");
  });

  it("the wrong species, a missing photo, a wrong site code: refused with the reason", () => {
    const v = judgeClaim(quest({ quest_kind: "log_species", species_code: ["narra"], is_photo: true, is_site_code: true }), claim({ has_photo: false }), ctx({ is_site_code_ok: false }));
    assert.equal(v.status, "refused");
    assert.equal(v.reason.length, 3);
  });

  it("too vague, too fast, never jittering, or a teleport since the last claim: sent to review, not refused", () => {
    assert.equal(judgeClaim(quest(), claim({ accuracy_m: 120 }), ctx()).status, "review", "at the site, but too vague to place");
    assert.equal(plausibilityFlag(claim({ accuracy_m: 70 }), null, T0).length, 1);
    const dash = walkPath().map((p, i) => ({ ...p, lat: SITE.lat - (5 - i) * 0.002 })); // ~220 m per 4 s
    assert.equal(judgeClaim(quest(), claim({ path: dash }), ctx()).status, "review");
    const frozen = walkPath().map((p) => ({ ...p, lat: SITE.lat, lon: SITE.lon }));
    assert.equal(judgeClaim(quest(), claim({ path: frozen }), ctx()).status, "review");
    const teleport = { lat: SITE.lat + 0.03, lon: SITE.lon, at_ms: T0 - 60_000 }; // 3.3 km a minute ago
    assert.equal(judgeClaim(quest(), claim(), ctx({ last_claim: teleport })).status, "review");
    const walked = { lat: SITE.lat + 0.003, lon: SITE.lon, at_ms: T0 - 20 * 60_000 }; // 330 m twenty minutes ago
    assert.equal(judgeClaim(quest(), claim(), ctx({ last_claim: walked })).status, "accepted");
  });

  it("a walker with voided claims goes to review every time", () => {
    assert.equal(judgeClaim(quest(), claim(), ctx({ strike_count: 2 })).status, "review");
  });
});

describe("site code", () => {
  it("six digits, stable within a step, changing across steps, good for the step before", async () => {
    const code = await siteCodeAt("secret-a", T0);
    assert.match(code, /^\d{6}$/);
    const step_start = T0 - (T0 % SITE_CODE_STEP_MS);
    assert.equal(await siteCodeAt("secret-a", step_start + 29_000), await siteCodeAt("secret-a", step_start));
    assert.notEqual(await siteCodeAt("secret-a", step_start + SITE_CODE_STEP_MS), await siteCodeAt("secret-a", step_start));
    assert.ok(await isSiteCode("secret-a", code, T0));
    assert.ok(await isSiteCode("secret-a", code, T0 + SITE_CODE_STEP_MS), "one step late still counts");
    assert.ok(!(await isSiteCode("secret-a", code, T0 + 3 * SITE_CODE_STEP_MS)), "a photographed code dies within a minute");
    assert.ok(!(await isSiteCode("secret-b", code, T0)), "another challenge's code does not open this one");
    assert.ok(!(await isSiteCode("secret-a", "12345", T0)));
  });
});

describe("input hygiene", () => {
  it("sanitizeClaim drops junk and coerces an unknown fix source to the untrusted one", () => {
    assert.equal(sanitizeClaim({ quest_code: "q-test" }), null);
    const c = sanitizeClaim({ ...claim(), fix_source: "spoofed", lat: 14.6, lon: 121.07, path: [{ lat: "x" }] });
    assert.equal(c?.fix_source, "play");
    assert.equal(c?.path.length, 0);
  });

  it("sanitizeQuestDraft refuses a draft that cannot be judged", () => {
    const base = { title: "Pond", quest_kind: "visit", site: SITE, start_at: "2026-10-10T00:00:00Z", end_at: "2026-10-11T00:00:00Z" };
    assert.ok("draft" in sanitizeQuestDraft(base));
    assert.ok("error" in sanitizeQuestDraft({ ...base, site: null }), "a visit needs a site");
    assert.ok("error" in sanitizeQuestDraft({ ...base, quest_kind: "log_species" }), "needs a species");
    assert.ok("error" in sanitizeQuestDraft({ ...base, end_at: "2026-10-09T00:00:00Z" }));
    assert.ok("error" in sanitizeQuestDraft({ ...base, class_code: "a b" }));
  });
});

function service(now = () => T0, session: SessionLookup | undefined = undefined) {
  const db = new DatabaseSync(":memory:");
  const sql: SqlRun = (query, ...bind) => db.prepare(query).all(...bind) as ReturnType<SqlRun>;
  return { sql, svc: new QuestService(sql, { token: TOKEN, now, session }) };
}
const BEARER = { Authorization: "Bearer token-of-at-least-16" };
const post = (path: string, body: unknown, header: Record<string, string> = {}) =>
  new Request(`https://magi.example${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...header }, body: JSON.stringify(body) });

async function create(svc: QuestService, over: Record<string, unknown> = {}): Promise<{ quest_code: string; secret: string }> {
  const res = await svc.handle(
    post("/seeds/api/action", {
      action: "create",
      quest: { title: "Pond life", quest_kind: "log_any", site: SITE, start_at: new Date(T0 - 3600_000).toISOString(), end_at: new Date(T0 + 3600_000).toISOString(), point: 50, ...over },
    }, BEARER),
  );
  const body = (await res!.json()) as { detail: { quest_code: string }; state: { quest: { quest_code: string; secret: string }[] } };
  const q = body.state.quest.find((x) => x.quest_code === body.detail.quest_code)!;
  return { quest_code: q.quest_code, secret: q.secret };
}

describe("QuestService (worker/quest.ts, node:sqlite)", () => {
  it("the console is off without SEEDS_TOKEN and refuses a wrong token", async () => {
    const db = new DatabaseSync(":memory:");
    const off = new QuestService((q, ...b) => db.prepare(q).all(...b) as ReturnType<SqlRun>, {});
    assert.equal((await off.handle(new Request("https://magi.example/seeds/api/state")))!.status, 404);
    const { svc } = service();
    assert.equal((await svc.handle(new Request("https://magi.example/seeds/api/state", { headers: { Authorization: "Bearer nope-nope-nope-nope" } })))!.status, 401);
  });

  it("a student sees the challenge without its secret, claims once, and the points are the server's", async () => {
    const { svc } = service();
    const { quest_code, secret } = await create(svc);
    const seen = (await (await svc.handle(new Request(`https://magi.example/quest?player_id=player-aaaaaaaa`)))!.json()) as { quest: Quest[] };
    assert.equal(seen.quest.length, 1);
    assert.ok(!JSON.stringify(seen).includes(secret), "the site secret never reaches a student");
    const first = await svc.handle(post("/quest/claim", claim({ quest_code })));
    assert.equal(first!.status, 201);
    assert.equal(((await first!.json()) as { verdict: { status: string } }).verdict.status, "accepted");
    assert.equal(svc.verifiedPoint("player-aaaaaaaa"), 50);
    const again = await svc.handle(post("/quest/claim", claim({ quest_code })));
    assert.equal(again!.status, 409, "one claim each");
  });

  it("one signed-in account cannot claim twice under two walker ids", async () => {
    const { svc } = service(() => T0, async () => ({ account_code: "acct-1", display_name: "Ana Cruz" }));
    const { quest_code } = await create(svc);
    assert.equal((await svc.handle(post("/quest/claim", claim({ quest_code }))))!.status, 201);
    assert.equal((await svc.handle(post("/quest/claim", claim({ quest_code, player_id: "player-bbbbbbbb" }))))!.status, 409);
  });

  it("a site-code challenge: the right code passes, guessing locks out after SITE_CODE_MISS_MAX", async () => {
    const { svc } = service();
    const { quest_code, secret } = await create(svc, { is_site_code: true });
    for (let i = 0; i < SITE_CODE_MISS_MAX; i += 1) {
      const res = await svc.handle(post("/quest/claim", claim({ quest_code, player_id: "player-guesser", site_code: String(100000 + i) })));
      assert.equal(((await res!.json()) as { verdict: { status: string } }).verdict.status, "refused");
    }
    const locked = await svc.handle(post("/quest/claim", claim({ quest_code, player_id: "player-guesser", site_code: await siteCodeAt(secret, T0) })));
    assert.equal(locked!.status, 429, "even the right code waits once locked");
    const honest = await svc.handle(post("/quest/claim", claim({ quest_code, site_code: await siteCodeAt(secret, T0) })));
    assert.equal(honest!.status, 201);
  });

  it("a claim from another site's page is refused", async () => {
    const { svc } = service();
    const { quest_code } = await create(svc);
    assert.equal((await svc.handle(post("/quest/claim", claim({ quest_code }), { Origin: "https://evil.example" })))!.status, 403);
  });

  it("review → void is a strike; two strikes send every later claim to review; approve pays and lifts", async () => {
    const { svc } = service();
    const one = await create(svc);
    const two = await create(svc);
    const three = await create(svc);
    const frozen = walkPath().map((p) => ({ ...p, lat: SITE.lat, lon: SITE.lon }));
    for (const q of [one, two]) {
      await svc.handle(post("/quest/claim", claim({ quest_code: q.quest_code, path: frozen })));
    }
    const state = (await (await svc.handle(new Request("https://magi.example/seeds/api/state", { headers: BEARER })))!.json()) as { claim: { claim_id: string; status: string }[] };
    assert.ok(state.claim.every((c) => c.status === "review"));
    for (const c of state.claim) await svc.handle(post("/seeds/api/action", { action: "void", target: c.claim_id }, BEARER));
    assert.equal(svc.strikeCount("player-aaaaaaaa"), 2);
    const later = await svc.handle(post("/quest/claim", claim({ quest_code: three.quest_code })));
    assert.equal(((await later!.json()) as { verdict: { status: string } }).verdict.status, "review");
    await svc.handle(post("/seeds/api/action", { action: "approve", target: state.claim[0].claim_id }, BEARER));
    assert.equal(svc.strikeCount("player-aaaaaaaa"), 1);
    assert.equal(svc.verifiedPoint("player-aaaaaaaa"), 50);
  });

  it("the audit log is append-only", async () => {
    const { svc, sql } = service();
    await create(svc);
    assert.throws(() => sql("DELETE FROM quest_audit"));
    assert.throws(() => sql("UPDATE quest_audit SET actor = 'x'"));
  });

  it("a class challenge shows only to students who entered the class code", async () => {
    const { svc } = service();
    await create(svc, { class_code: "BIO101" });
    const none = (await (await svc.handle(new Request("https://magi.example/quest?player_id=player-aaaaaaaa")))!.json()) as { quest: unknown[] };
    const with_class = (await (await svc.handle(new Request("https://magi.example/quest?player_id=player-aaaaaaaa&class=bio101")))!.json()) as { quest: unknown[] };
    assert.equal(none.quest.length, 0);
    assert.equal(with_class.quest.length, 1);
  });
});
