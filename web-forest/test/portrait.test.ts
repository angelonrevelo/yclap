import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPhotoLicenceAllowed,
  mapTaxonPhoto,
  PORTRAIT_SEED,
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
            default_photo: { medium_url: "https://example.com/wrong.jpg", license_code: "cc-by", attribution: "(c) A" },
          },
          {
            name: "Samanea saman",
            default_photo: { medium_url: "https://example.com/saman.jpg", license_code: "cc0", attribution: "no rights reserved" },
          },
        ],
      },
      "Samanea saman",
    );
    assert.equal(url?.url, "https://example.com/saman.jpg");
  });

  it("falls back to the first https photo when the name is not exact", () => {
    const url = mapTaxonPhoto(
      {
        results: [
          { name: "Other", default_photo: { square_url: "http://insecure.example/no.jpg", license_code: "cc0" } },
          { name: "Other two", default_photo: { square_url: "https://example.com/ok.jpg", license_code: "cc-by", attribution: "(c) B" } },
        ],
      },
      "Missingia absoluta",
    );
    assert.equal(url?.url, "https://example.com/ok.jpg");
  });

  it("returns null when no photo is usable", () => {
    assert.equal(mapTaxonPhoto({ results: [{ name: "X" }] }, "X"), null);
    assert.equal(mapTaxonPhoto({}, "X"), null);
  });
});

describe("photo licences (10-01)", () => {
  it("every seeded photo carries a licence this app may show, and an attribution", () => {
    for (const [name, p] of Object.entries(PORTRAIT_SEED)) {
      assert.ok(isPhotoLicenceAllowed(p.licence_code), `${name}: ${p.licence_code} may not be shown`);
      assert.ok(p.attribution.length > 5, `${name} has no attribution`);
    }
    assert.equal(PORTRAIT_SEED["tectona grandis"], undefined, "Teak's default photo is all rights reserved");
  });

  it("never shows an all-rights-reserved or no-derivatives photo, and drops non-commercial when paid", () => {
    assert.equal(isPhotoLicenceAllowed(null), false);
    assert.equal(isPhotoLicenceAllowed("cc-by-nc-nd"), false);
    assert.equal(isPhotoLicenceAllowed("cc-by-nc", false), true);
    assert.equal(isPhotoLicenceAllowed("cc-by-nc", true), false);
    assert.equal(isPhotoLicenceAllowed("cc-by", true), true);
  });

  it("skips a disallowed photo and takes the next usable one, keeping its credit", () => {
    const got = mapTaxonPhoto(
      {
        results: [
          { name: "Tectona grandis", default_photo: { medium_url: "https://example.com/arr.jpg", license_code: null, attribution: "(c) X, all rights reserved" } },
          { name: "Tectona hamiltoniana", default_photo: { medium_url: "https://example.com/open.jpg", license_code: "cc-by", attribution: "(c) Y, some rights reserved (CC BY)" } },
        ],
      },
      "Tectona grandis",
    );
    assert.deepEqual(got, { url: "https://example.com/open.jpg", licence_code: "cc-by", attribution: "(c) Y, some rights reserved (CC BY)" });
  });
});
