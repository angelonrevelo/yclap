import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { species } from "../src/data.ts";
import { mapScoreImage } from "../src/inat.ts";
import { bestCampusMatch, campus_taxon, exactPosition, matchCampus } from "../src/inat-match.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const response_dir = join(dir, "detect-smoke/response");

function saved(code: string): unknown {
  return (JSON.parse(readFileSync(join(response_dir, `${code}.json`), "utf8")) as { body: unknown }).body;
}

/** Suggestion by scientific name out of a saved reply, so the test reads real ids. */
function suggestionNamed(code: string, name: string) {
  const row = mapScoreImage(saved(code)).find((s) => s.scientific_name === name);
  assert.ok(row, `${name} missing from response/${code}.json`);
  return row;
}

describe("campus_taxon", () => {
  it("covers every curated campus species exactly once, with the same scientific name", () => {
    assert.deepEqual(campus_taxon.map((c) => c.species_code).sort(), Object.keys(species).sort());
    for (const c of campus_taxon) assert.equal(c.scientific_name, species[c.species_code]!.scientific_name);
  });
});

describe("matchCampus", () => {
  it("exact: the campus taxon itself", () => {
    const match = matchCampus(suggestionNamed("narra", "Pterocarpus indicus"));
    assert.deepEqual(match?.species_code, ["narra"]);
    assert.equal(match?.match_kind, "exact");
    assert.equal(match?.is_partial, false);
    assert.equal(match?.is_by_name, false);
  });

  it("exact: any fig lands on Balete, because the campus row is the genus", () => {
    const match = matchCampus(suggestionNamed("balete", "Ficus septica"));
    assert.equal(match?.match_kind, "exact");
    assert.deepEqual(match?.species_code, ["balete"]);
  });

  it("genus roll-up: 'Vitex' is Molave OR Lagundi, flagged partial", () => {
    const match = matchCampus(suggestionNamed("molave", "Vitex"));
    assert.equal(match?.match_kind, "genus");
    assert.equal(match?.is_partial, true);
    assert.deepEqual(match?.species_code.sort(), ["lagundi", "molave"]);
    assert.equal(match?.matched_name, "Vitex");
  });

  it("genus roll-up: a sibling species (Vitex trifolia) is not an exact hit", () => {
    const match = matchCampus(suggestionNamed("lagundi", "Vitex trifolia"));
    assert.equal(match?.match_kind, "genus");
    assert.equal(match?.is_partial, true);
  });

  it("family roll-up: Mango is only an Anacardiaceae hint for Dao", () => {
    const match = matchCampus(suggestionNamed("dao", "Mangifera indica"));
    assert.equal(match?.match_kind, "family");
    assert.deepEqual(match?.species_code, ["dao"]);
    assert.equal(match?.matched_name, "Anacardiaceae");
  });

  it("family roll-up: Leucaena rolls up to both campus Fabaceae", () => {
    const match = matchCampus(suggestionNamed("narra", "Leucaena leucocephala"));
    assert.equal(match?.match_kind, "family");
    assert.deepEqual(match?.species_code.sort(), ["narra", "raintree"]);
  });

  it("no match outside every campus family", () => {
    assert.equal(matchCampus(suggestionNamed("katmon", "Terminalia catappa")), null);
  });

  it("falls back to the name when iNat sent no ancestry (the older fixture shape)", () => {
    const fixture = JSON.parse(readFileSync(join(dir, "fixture/score-image.json"), "utf8"));
    const row = mapScoreImage(fixture);
    assert.equal(row[0]?.ancestor_ids.length, 0);
    const top = matchCampus(row[0]!);
    assert.equal(top?.match_kind, "exact");
    assert.deepEqual(top?.species_code, ["narra"]);
    const sibling = row.find((s) => s.scientific_name === "Pterocarpus macrocarpus")!;
    const partial = matchCampus(sibling);
    assert.equal(partial?.match_kind, "genus");
    assert.equal(partial?.is_by_name, true);
  });

  it("reads the `ancestry` string when ancestor_ids is absent", () => {
    const [row] = mapScoreImage({
      results: [{ combined_score: 0.5, taxon: { id: 369434, name: "Ficus septica", rank: "species", ancestry: "48460/47126/211194/47125/47124/47132/50998/1529470/50999" } }],
    });
    assert.deepEqual(row?.ancestor_ids.slice(-1), [50999]);
    assert.deepEqual(matchCampus(row!)?.species_code, ["balete"]);
  });
});

describe("bestCampusMatch / exactPosition", () => {
  it("prefers the first exact match over an earlier partial", () => {
    const suggestion = mapScoreImage(saved("molave"));
    const best = bestCampusMatch(suggestion);
    assert.equal(best?.position, 2);
    assert.deepEqual(best?.match.species_code, ["molave"]);
    assert.equal(exactPosition(suggestion, "molave", 1), null);
    assert.equal(exactPosition(suggestion, "molave", 5), 2);
    assert.equal(exactPosition(suggestion, "lagundi", 5), 5);
  });

  it("returns the first partial when nothing is exact", () => {
    const suggestion = mapScoreImage(saved("molave")).filter((s) => s.taxon_rank !== "species");
    const best = bestCampusMatch(suggestion);
    assert.equal(best?.match.is_partial, true);
  });

  it("every saved smoke reply contains an exact hit for its own species", () => {
    for (const file of readdirSync(response_dir)) {
      const code = file.replace(/\.json$/, "");
      assert.ok(exactPosition(mapScoreImage(saved(code)), code, 5), `${code} has no exact hit in its top 5`);
    }
  });
});
