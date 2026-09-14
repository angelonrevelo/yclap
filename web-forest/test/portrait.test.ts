import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapTaxonPhoto,
  portraitKey,
  seededPortrait,
  taxaPortraitUrl,
} from "../src/taxon-photo.ts";

describe("portraitKey", () => {
  it("trims and lowercases so seed and cache share one key", () => {
    assert.equal(portraitKey("  Pterocarpus indicus "), "pterocarpus indicus");
  });
});

describe("seededPortrait", () => {
  it("returns the Narra iNat close-up and a Ficus stand-in for Balete", () => {
    const narra = seededPortrait("Pterocarpus indicus");
    assert.ok(narra?.startsWith("https://"));
    assert.ok(narra?.includes("photos/"));
    assert.equal(seededPortrait("Ficus sp."), seededPortrait("Ficus benjamina"));
    assert.equal(seededPortrait("Nobodyia inventa"), null);
  });
});

describe("taxaPortraitUrl", () => {
  it("asks iNat for an active species match", () => {
    const url = taxaPortraitUrl("Vitex parviflora");
    assert.ok(url.startsWith("https://api.inaturalist.org/v1/taxa?"));
    assert.ok(url.includes("q=Vitex"));
    assert.ok(url.includes("rank=species"));
  });
});

describe("mapTaxonPhoto", () => {
  it("prefers the exact scientific name when several results have photos", () => {
    const url = mapTaxonPhoto(
      {
        results: [
          {
            name: "Samanea tubulosa",
            default_photo: { medium_url: "https://example.com/wrong.jpg" },
          },
          {
            name: "Samanea saman",
            default_photo: { medium_url: "https://example.com/saman.jpg" },
          },
        ],
      },
      "Samanea saman",
    );
    assert.equal(url, "https://example.com/saman.jpg");
  });

  it("falls back to the first https photo when the name is not exact", () => {
    const url = mapTaxonPhoto(
      {
        results: [
          { name: "Other", default_photo: { square_url: "http://insecure.example/no.jpg" } },
          { name: "Other two", default_photo: { square_url: "https://example.com/ok.jpg" } },
        ],
      },
      "Missingia absoluta",
    );
    assert.equal(url, "https://example.com/ok.jpg");
  });

  it("returns null when no photo is usable", () => {
    assert.equal(mapTaxonPhoto({ results: [{ name: "X" }] }, "X"), null);
    assert.equal(mapTaxonPhoto({}, "X"), null);
  });
});
