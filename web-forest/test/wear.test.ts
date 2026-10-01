import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buyWear, ownedWear, pointBalance, toggleWear, WEAR, wearById, wearIdOfMaterial, wornOn, type Purchase } from "../src/wear.ts";

/* ── accessories on the 3D figures (Gelo 10-01: "3d figures + accessories
 *    (from shop/blindbox/etc.) and pet") ──────────────────────────────────── */

function glbJson(file: string): { materials: { name: string }[]; animations: { name: string }[] } {
  const buf = readFileSync(new URL(`../public/model/${file}`, import.meta.url));
  const length = new DataView(buf.buffer, buf.byteOffset).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + length)));
}
const accIn = (file: string) => new Set(glbJson(file).materials.map((m) => wearIdOfMaterial(m.name)).filter(Boolean));
const PET_FILE = ["agila-egg.glb", "agila-hatchling.glb", "agila-eaglet.glb", "agila-eagle.glb"];

describe("wear catalogue and the models agree", () => {
  it("every trainer accessory is built into the trainer model, and nothing else is", () => {
    const built = accIn("agila-trainer.glb");
    const listed = new Set(WEAR.filter((w) => w.figure === "trainer").map((w) => w.wear_id));
    assert.deepEqual([...built].sort(), [...listed].sort());
  });

  it("every pet accessory is on every stage (a flying eagle has no perch to stand the pot on)", () => {
    for (const file of PET_FILE) {
      const built = accIn(file);
      for (const w of WEAR.filter((x) => x.figure === "pet")) {
        if (file === "agila-eagle.glb" && w.wear_id === "sprout-pot") continue;
        assert.ok(built.has(w.wear_id), `${w.wear_id} missing from ${file}`);
      }
      for (const id of built) assert.equal(wearById(id as string)?.figure, "pet", `${id} in ${file} is not a pet item`);
    }
  });

  it("every pet stage plays idle / walk / sleep / happy, the trainer idle / walk / cheer", () => {
    for (const file of PET_FILE) assert.deepEqual(glbJson(file).animations.map((a) => a.name).sort(), ["happy", "idle", "sleep", "walk"]);
    assert.deepEqual(glbJson("agila-trainer.glb").animations.map((a) => a.name).sort(), ["cheer", "idle", "walk"]);
  });

  it("material names map back to accessory ids, and only accessory materials do", () => {
    assert.equal(wearIdOfMaterial("acc_charm-narra-leaf_0"), "charm-narra-leaf");
    assert.equal(wearIdOfMaterial("acc_shop-pet-bandana_12"), "shop-pet-bandana");
    assert.equal(wearIdOfMaterial("eagle"), null);
  });

  it("every item has a slot; box items are the blind-box charms, stage items the stage cosmetics", () => {
    for (const w of WEAR) assert.ok(w.slot, w.wear_id);
    assert.equal(WEAR.filter((w) => w.source === "box").length, 8);
    assert.equal(WEAR.filter((w) => w.source === "stage").length, 3);
    assert.ok(WEAR.filter((w) => w.source === "shop").every((w) => (w.price ?? 0) > 0));
  });
});

describe("owning, buying, wearing", () => {
  const salakot = wearById("shop-salakot")!;
  const leaf = wearById("charm-narra-leaf")!;
  const flower = wearById("charm-sampaguita")!;

  it("the shop spends a balance and never more than it", () => {
    assert.equal(buyWear(salakot, 100, []).ok, false);
    const bought = buyWear(salakot, 500, []);
    assert.ok(bought.ok);
    const purchase = (bought as { purchase: Purchase[] }).purchase;
    assert.equal(pointBalance(500, purchase), 200);
    assert.equal(buyWear(salakot, 500, purchase).ok, false, "not twice");
    assert.equal(buyWear(leaf, 9999, []).ok, false, "a charm is never sold");
  });

  it("owned is charms opened + stage rewards + purchases, and nothing unknown", () => {
    const owned = ownedWear({ charm_id: ["charm-narra-leaf", "made-up"], stage_cosmetic_id: ["tree-crown"], purchase: [{ wear_id: "shop-salakot", price: 300, at: "" }] });
    assert.deepEqual([...owned].sort(), ["charm-narra-leaf", "shop-salakot", "tree-crown"]);
  });

  it("one per slot: wearing a second cap pin swaps the first; wearing it again takes it off; unowned does nothing", () => {
    const owned = new Set(["charm-narra-leaf", "charm-sampaguita"]);
    let outfit = toggleWear({}, leaf, owned);
    assert.equal(outfit.cap_pin, "charm-narra-leaf");
    outfit = toggleWear(outfit, flower, owned);
    assert.equal(outfit.cap_pin, "charm-sampaguita");
    outfit = toggleWear(outfit, flower, owned);
    assert.equal(outfit.cap_pin, undefined);
    assert.deepEqual(toggleWear({}, salakot, owned), {});
  });

  it("each figure wears only its own owned items", () => {
    const owned = new Set(["charm-narra-leaf", "tree-crown"]);
    const outfit = { cap_pin: "charm-narra-leaf", pet_head: "tree-crown", hat: "shop-salakot" };
    assert.deepEqual(wornOn("trainer", outfit, owned), ["charm-narra-leaf"]);
    assert.deepEqual(wornOn("pet", outfit, owned), ["tree-crown"]);
  });
});
