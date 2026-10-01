/**
 * Accessories — what the trainer and the pet wear, where each came from, and
 * which are on.
 *
 * Gelo, 10-01: "3d figures + accessories (from shop/blindbox/etc.) and pet".
 * The blind box already handed out charms and the stages already granted a
 * pot, a moss ring and a crown — as stickers in a list. Now each is a real
 * piece on the 3D model (`script/art/build-eagle-glb.mjs` builds every one
 * into the model in its own `acc_<id>_<n>` material; `character-model.tsx`
 * shows the worn ones and hides the rest), so a leaf pin rides the cap
 * through the walk and the crown sits on the eagle's head in flight.
 *
 * Three ways to own one:
 *   box   — opened from a blind box (`blindbox.ts`, the charm shelf);
 *   stage — granted as the buddy grows (`cosmetic.ts`);
 *   shop  — bought with points. Points stay yours: the shop spends a balance
 *           (total earned − spent), it never takes points off the ledger, so
 *           a level or a leaderboard row is never lowered by shopping.
 *
 * One item per slot; equipping a second in the same slot swaps it.
 * Plain module — tests import it.
 */
import { BLINDBOX_POOL } from "./blindbox.ts";
import { COSMETIC_LIST } from "./cosmetic.ts";

export type WearFigure = "trainer" | "pet";
export type WearSlot = "hat" | "cap_pin" | "ear" | "face" | "neck" | "chest" | "strap" | "back" | "float" | "pet_head" | "pet_neck" | "pet_base";
export type WearSource = "box" | "stage" | "shop";

export interface WearItem {
  wear_id: string;
  name: string;
  figure: WearFigure;
  slot: WearSlot;
  source: WearSource;
  /** Points, for a shop item. */
  price: number | null;
  accent: string;
  blurb: string;
}

export const SLOT_LABEL: Record<WearSlot, string> = {
  hat: "Hat",
  cap_pin: "Cap pin",
  ear: "Behind the ear",
  face: "Face",
  neck: "Neck",
  chest: "Chest",
  strap: "Strap",
  back: "Backpack",
  float: "Companion light",
  pet_head: "Pet's head",
  pet_neck: "Pet's neck",
  pet_base: "Pet's perch",
};

/** Where each blind-box charm is worn. */
const CHARM_SLOT: Record<string, WearSlot> = {
  "charm-narra-leaf": "cap_pin",
  "charm-sampaguita": "cap_pin",
  "charm-eagle-feather": "ear",
  "charm-kingfisher": "ear",
  "charm-gumamela": "chest",
  "charm-morning-dew": "chest",
  "charm-acacia-pod": "back",
  "charm-firefly": "float",
};

const STAGE_SLOT: Record<string, WearSlot> = {
  "sprout-pot": "pet_base",
  "sapling-ring": "pet_neck",
  "tree-crown": "pet_head",
};

const SHOP: Omit<WearItem, "source">[] = [
  { wear_id: "shop-salakot", name: "Salakot", figure: "trainer", slot: "hat", price: 300, accent: "#C9A25E", blurb: "A woven field hat. Shade you carry." },
  { wear_id: "shop-scarf", name: "Blue and White Scarf", figure: "trainer", slot: "neck", price: 200, accent: "#24478A", blurb: "For the walk back after dark." },
  { wear_id: "shop-glasses", name: "Field Glasses", figure: "trainer", slot: "face", price: 150, accent: "#1B2E16", blurb: "Round, scratched, and they suit you." },
  { wear_id: "shop-binocular", name: "Binoculars", figure: "trainer", slot: "strap", price: 250, accent: "#1B2E16", blurb: "For the bird at the top of the acacia." },
  { wear_id: "shop-pet-bandana", name: "Red Bandana", figure: "pet", slot: "pet_neck", price: 200, accent: "#D2453D", blurb: "Agila's, knotted at the back." },
];

export const WEAR: WearItem[] = [
  ...BLINDBOX_POOL.map((c) => ({ wear_id: c.id, name: c.name, figure: "trainer" as const, slot: CHARM_SLOT[c.id], source: "box" as const, price: null, accent: c.accent, blurb: c.blurb })),
  ...COSMETIC_LIST.map((c) => ({ wear_id: c.id, name: c.name, figure: "pet" as const, slot: STAGE_SLOT[c.id], source: "stage" as const, price: null, accent: c.accent, blurb: c.blurb })),
  ...SHOP.map((s) => ({ ...s, source: "shop" as const })),
];

export function wearById(wear_id: string): WearItem | null {
  return WEAR.find((w) => w.wear_id === wear_id) ?? null;
}

/** `acc_charm-narra-leaf_0` → `charm-narra-leaf`; any other material → null. */
export function wearIdOfMaterial(name: string): string | null {
  const hit = /^acc_(.+)_\d+$/.exec(name);
  return hit ? hit[1] : null;
}

/* ── owning ─────────────────────────────────────────────────────────────── */

export interface Purchase {
  wear_id: string;
  price: number;
  at: string;
}

export function ownedWear(input: { charm_id: Iterable<string>; stage_cosmetic_id: Iterable<string>; purchase: Purchase[] }): Set<string> {
  return new Set([...input.charm_id, ...input.stage_cosmetic_id, ...input.purchase.map((p) => p.wear_id)].filter((id) => wearById(id) !== null));
}

export function spentPoint(purchase: Purchase[]): number {
  return purchase.reduce((sum, p) => sum + Math.max(0, p.price), 0);
}

export function pointBalance(total_point: number, purchase: Purchase[]): number {
  return Math.max(0, total_point - spentPoint(purchase));
}

export type BuyResult = { ok: true; purchase: Purchase[] } | { ok: false; reason: string };

export function buyWear(item: WearItem, total_point: number, purchase: Purchase[], now: Date = new Date()): BuyResult {
  if (item.source !== "shop" || item.price === null) return { ok: false, reason: `${item.name} is not sold — it comes from a ${item.source === "box" ? "blind box" : "growing buddy"}.` };
  if (purchase.some((p) => p.wear_id === item.wear_id)) return { ok: false, reason: "Already yours." };
  const balance = pointBalance(total_point, purchase);
  if (balance < item.price) return { ok: false, reason: `${item.price - balance} more points to go.` };
  return { ok: true, purchase: [...purchase, { wear_id: item.wear_id, price: item.price, at: now.toISOString() }] };
}

/* ── wearing ────────────────────────────────────────────────────────────── */

/** slot → wear_id. */
export type Outfit = Partial<Record<WearSlot, string>>;

/** Put it on (swapping out whatever was in its slot), or take it off if it is on. Unowned: unchanged. */
export function toggleWear(outfit: Outfit, item: WearItem, owned: Set<string>): Outfit {
  if (!owned.has(item.wear_id)) return outfit;
  if (outfit[item.slot] === item.wear_id) {
    const next = { ...outfit };
    delete next[item.slot];
    return next;
  }
  return { ...outfit, [item.slot]: item.wear_id };
}

/** What this figure wears now: owned, on, and its own. */
export function wornOn(figure: WearFigure, outfit: Outfit, owned: Set<string>): string[] {
  return Object.values(outfit).filter((id): id is string => {
    const item = id ? wearById(id) : null;
    return item !== null && item.figure === figure && owned.has(id!);
  });
}

/* ── storage ────────────────────────────────────────────────────────────── */

const OUTFIT_KEY = "magi.outfit";
const PURCHASE_KEY = "magi.purchase";

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readOutfit(storage: Storage | null = store()): Outfit {
  try {
    const raw = JSON.parse(storage?.getItem(OUTFIT_KEY) ?? "{}") as Record<string, unknown>;
    const out: Outfit = {};
    for (const [slot, id] of Object.entries(raw)) {
      const item = typeof id === "string" ? wearById(id) : null;
      if (item && item.slot === slot) out[item.slot] = item.wear_id;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeOutfit(outfit: Outfit, storage: Storage | null = store()): void {
  try {
    storage?.setItem(OUTFIT_KEY, JSON.stringify(outfit));
  } catch {
    /* private mode */
  }
}

export function readPurchase(storage: Storage | null = store()): Purchase[] {
  try {
    const raw = JSON.parse(storage?.getItem(PURCHASE_KEY) ?? "[]") as unknown;
    return Array.isArray(raw)
      ? raw.filter((p): p is Purchase => !!p && typeof p.wear_id === "string" && typeof p.price === "number" && wearById(p.wear_id)?.source === "shop")
      : [];
  } catch {
    return [];
  }
}

export function writePurchase(purchase: Purchase[], storage: Storage | null = store()): void {
  try {
    storage?.setItem(PURCHASE_KEY, JSON.stringify(purchase));
  } catch {
    /* private mode */
  }
}

/** Fired on window when the outfit or the purchases change, so every figure on screen re-dresses. */
export const OUTFIT_EVENT = "magi:outfit";
