import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { altitudeAt, FILE_TRACK, lengthFraction, MEDIUM_OF, mediumOf, shownTrack, TRACK_STYLE, trackProblem, type Track } from "../src/track.ts";

/* ── the way network and the tracks over it (Gelo 10-01) ─────────────────────
 *
 * "its not clean, roundy, osm and our are overlapping": the play ground drew
 * every OSM highway, so a road and the sidewalk mapped beside it were two
 * ribbons, and every stub ended in a round blob. `script/build-network.mjs`
 * cleans the network once; these hold what it promises.
 */

interface NetworkFile {
  report: Record<string, number>;
  way: { way_class: string; is_outside: boolean; point: [number, number][] }[];
  water: { water_kind: string; name: string | null; point: [number, number][] }[];
}
const network = JSON.parse(readFileSync(new URL("../src/asset/campus-network.json", import.meta.url), "utf8")) as NetworkFile;

const LAT0 = 14.6393;
const toM = ([lat, lon]: [number, number]): [number, number] => [(lon - 121.0785) * 111320 * Math.cos((LAT0 * Math.PI) / 180), (lat - LAT0) * 110574];
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function nearest(p: [number, number], line: [number, number][]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) {
    const [a, b] = [line[i - 1], line[i]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1e-9)));
    best = Math.min(best, dist(p, [a[0] + t * dx, a[1] + t * dy]));
  }
  return best;
}
const lengthOf = (line: [number, number][]) => line.slice(1).reduce((sum, p, i) => sum + dist(line[i], p), 0);

const street = network.way.filter((w) => w.way_class === "street").map((w) => w.point.map(toM));
const walk = network.way.filter((w) => w.way_class !== "street").map((w) => w.point.map(toM));

describe("way network (campus-network.json)", () => {
  it("every way is a street, walk or stair with at least two points", () => {
    for (const w of network.way) {
      assert.ok(["street", "walk", "stair"].includes(w.way_class), w.way_class);
      assert.ok(w.point.length >= 2);
    }
  });

  it("the report adds up to what is in the file", () => {
    const by = (c: string) => network.way.filter((w) => w.way_class === c).length;
    assert.equal(network.report.street, by("street"));
    assert.equal(network.report.walk, by("walk"));
    assert.equal(network.report.stair, by("stair"));
    assert.equal(network.report.water, network.water.length);
  });

  it("drops what a player never reads as a way: sidewalks, crossings, driveways, parking aisles", () => {
    assert.ok(network.report.drop_sidewalk > 0 && network.report.drop_crossing > 0);
    assert.ok(network.report.drop_driveway > 0 && network.report.drop_parking_aisle > 0);
  });

  it("no walk runs inside a street's ribbon for most of its length — a sidewalk is not drawn twice", () => {
    const shadowed = walk.filter((line) => {
      const sample = line.flatMap((p, i) => (i === 0 ? [p] : Array.from({ length: 4 }, (_, k) => [line[i - 1][0] + ((p[0] - line[i - 1][0]) * (k + 1)) / 4, line[i - 1][1] + ((p[1] - line[i - 1][1]) * (k + 1)) / 4] as [number, number])));
      const inside = sample.filter((p) => street.some((s) => nearest(p, s) < 4)).length;
      return inside / sample.length > 0.6;
    });
    assert.equal(shadowed.length, 0, `${shadowed.length} walks shadow a street`);
  });

  it("no dead-end walk stub shorter than 9 m (they drew as blobs)", () => {
    const all = [...street, ...walk];
    const joined = (p: [number, number], self: [number, number][]) => all.some((o) => o !== self && nearest(p, o) < 0.5);
    const stub = walk.filter((line) => lengthOf(line) < 9 && (!joined(line[0], line) || !joined(line[line.length - 1], line)));
    assert.equal(stub.length, 0);
  });

  it("draws the open water the old ground never did: the pond", () => {
    assert.ok(network.water.some((w) => w.water_kind === "pond" && w.point.length >= 4));
  });

  it("the play map reads this file, not the old uncleaned paths", () => {
    const source = readFileSync(new URL("../src/play-map.tsx", import.meta.url), "utf8");
    assert.match(source, /campus-network\.json/);
    assert.doesNotMatch(source, /campus-shape\.json/);
    /* Square ends on ways; no centre dashes running through junctions. */
    assert.match(source, /strokeLinecap="butt" strokeLinejoin="round"/);
  });
});

describe("tracks: land, sea, air (track.ts)", () => {
  const good: Track = { track_code: "t", track_kind: "hike", title: "t", source: "s", point: [{ lat: 10.3, lon: 123.9 }, { lat: 10.31, lon: 123.91 }] };

  it("every kind has one medium and one style", () => {
    for (const kind of Object.keys(MEDIUM_OF) as (keyof typeof MEDIUM_OF)[]) {
      assert.ok(TRACK_STYLE[kind], kind);
      assert.ok(["land", "sea", "air"].includes(MEDIUM_OF[kind]));
    }
    assert.deepEqual(new Set(Object.values(MEDIUM_OF)), new Set(["land", "sea", "air"]));
  });

  it("trackProblem refuses a broken line instead of drawing it", () => {
    assert.deepEqual(trackProblem(good), []);
    assert.ok(trackProblem({ ...good, point: [good.point[0]] }).length);
    assert.ok(trackProblem({ ...good, point: [{ lat: 200, lon: 0 }, good.point[1]] }).length);
    assert.ok(trackProblem({ ...good, track_kind: "flyway" }).length, "air needs an altitude");
    assert.deepEqual(trackProblem({ ...good, track_kind: "flyway", altitude_m: 20 }), []);
    assert.ok(trackProblem({ ...good, altitude_m: 20 }).length, "a ground track has no altitude");
    assert.ok(trackProblem({ ...good, source: " " }).length);
  });

  it("every shipped track file is valid and registered", () => {
    const dir = new URL("../src/asset/track/", import.meta.url);
    const code = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => (JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Track).track_code)
      .sort();
    assert.deepEqual(FILE_TRACK.map((t) => t.track_code).sort(), code);
    for (const t of FILE_TRACK) assert.deepEqual(trackProblem(t), [], t.track_code);
  });

  it("the shore track follows the pond's edge, and the demo flyway says it is a demo and lands at the pond", () => {
    const pond = network.water.find((w) => w.water_kind === "pond")!.point.map(toM);
    const ring = [...pond, pond[0]];
    const shore = FILE_TRACK.find((t) => t.track_kind === "shore")!;
    for (const p of shore.point) assert.ok(nearest(toM([p.lat, p.lon]), ring) < 1, "on the pond edge");
    const fly = FILE_TRACK.find((t) => mediumOf(t) === "air")!;
    assert.equal(fly.is_demo, true);
    const end = fly.point[fly.point.length - 1];
    assert.ok(nearest(toM([end.lat, end.lon]), ring) < 25);
  });

  it("an air track rises off the ground and comes back down", () => {
    assert.equal(altitudeAt(20, 0), 0);
    assert.equal(altitudeAt(20, 1), 0);
    assert.equal(altitudeAt(20, 0.5), 20);
    const f = lengthFraction([{ lat: 0, lon: 0 }, { lat: 0.001, lon: 0 }, { lat: 0.003, lon: 0 }]);
    assert.deepEqual(f.map((x) => Number(x.toFixed(3))), [0, 0.333, 1]);
  });

  it("shownTrack: the leg you are on is drawn last and full, walked legs faint, files only when the layer is on", () => {
    const from = { lat: 14.639, lon: 121.077 };
    const leg = [0, 1, 2].map((k) => ({ from, waypoint: [{ lat: 14.639 + k * 1e-4, lon: 121.077 }] }));
    const out = shownTrack({ trail_leg: leg, trail_at: 1 });
    assert.equal(out.length, 3);
    assert.equal(out[out.length - 1].track_code, "trail-leg-1");
    assert.equal(out.find((t) => t.track_code === "trail-leg-0")!.is_done, true);
    assert.equal(shownTrack({ is_file_shown: false }).length, 0);
    /* Cebu's tracks are drawn on the field map; the campus play map shows its own. */
    assert.equal(shownTrack({ is_file_shown: true }).length, FILE_TRACK.filter((t) => !t.site_code).length);
    assert.ok(FILE_TRACK.some((t) => t.site_code === "cebu" && t.track_kind === "hike"));
    assert.ok(FILE_TRACK.some((t) => t.site_code === "cebu" && t.track_kind === "dive"));
    const help = shownTrack({ help: { from, waypoint: [{ lat: 14.64, lon: 121.078 }], title: "To the clinic" } });
    assert.equal(help[0].track_kind, "help");
    assert.equal(help[0].point[0], from);
    /* A leg the router could not find is not drawn as a straight line. */
    assert.equal(shownTrack({ trail_leg: [{ from, waypoint: null }] }).length, 0);
  });
});
