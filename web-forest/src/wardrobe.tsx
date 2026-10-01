/**
 * The wardrobe — every accessory, where it comes from, and what is on.
 *
 * Sits in the Journal under the blind boxes. A live 3D preview of you and your
 * pet (the same models the map draws, dressed the same way), then one row per
 * accessory: wear it, take it off, buy it from the shop, or see where it comes
 * from. The rules are in `wear.ts`; this is drawing and wiring.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Card, Eyebrow } from "./ui";
import type { Stage } from "./stage";
import { celebrate } from "./use-wear";
import { ownedNow } from "./use-wear";
import {
  buyWear,
  OUTFIT_EVENT,
  pointBalance,
  readOutfit,
  readPurchase,
  SLOT_LABEL,
  toggleWear,
  WEAR,
  wornOn,
  writeOutfit,
  writePurchase,
  type WearFigure,
  type WearItem,
} from "./wear";

const CharacterModel = lazy(() => import("./character-model"));
const TRAINER_MODEL = "/model/agila-trainer.glb";

const SOURCE_LINE: Record<WearItem["source"], string> = {
  box: "From a blind box",
  stage: "Grows with your buddy",
  shop: "Shop",
};

export default function Wardrobe({ total_point, stage, refresh_key }: { total_point: number; stage: Stage; refresh_key?: unknown }) {
  const [outfit, setOutfit] = useState(readOutfit);
  const [purchase, setPurchase] = useState(readPurchase);
  const [owned, setOwned] = useState(ownedNow);
  const [figure, setFigure] = useState<WearFigure>("trainer");
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    setOwned(ownedNow());
  }, [refresh_key, purchase]);
  useEffect(() => {
    const again = () => {
      setOutfit(readOutfit());
      setPurchase(readPurchase());
      setOwned(ownedNow());
    };
    window.addEventListener(OUTFIT_EVENT, again);
    return () => window.removeEventListener(OUTFIT_EVENT, again);
  }, []);

  const balance = pointBalance(total_point, purchase);
  /* What you own first, then what the shop sells, then what is still to find. */
  const row = useMemo(() => {
    const rank = (w: WearItem) => (owned.has(w.wear_id) ? 0 : w.source === "shop" ? 1 : 2);
    return WEAR.filter((w) => w.figure === figure).sort((a, b) => rank(a) - rank(b));
  }, [figure, owned]);
  const worn_trainer = wornOn("trainer", outfit, owned);
  const worn_pet = wornOn("pet", outfit, owned);

  const wear = (item: WearItem) => {
    const next = toggleWear(outfit, item, owned);
    writeOutfit(next);
    setOutfit(next);
    window.dispatchEvent(new Event(OUTFIT_EVENT));
    if (next[item.slot] === item.wear_id) celebrate();
  };
  const buy = (item: WearItem) => {
    const result = buyWear(item, total_point, purchase);
    if (!result.ok) {
      setSaid(result.reason);
      return;
    }
    writePurchase(result.purchase);
    setPurchase(result.purchase);
    const now_owned = new Set([...owned, item.wear_id]);
    setOwned(now_owned);
    /* Bought to be worn: on at once. */
    const next = toggleWear(outfit, item, now_owned);
    writeOutfit(next);
    setOutfit(next);
    window.dispatchEvent(new Event(OUTFIT_EVENT));
    setSaid(`${item.name} is yours.`);
    celebrate();
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>WARDROBE</Eyebrow>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgb(var(--mg-ink-rgb) / 0.7)" }}>{balance} pts to spend</span>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 10, justifyContent: "center" }}>
        <Suspense fallback={<div style={{ width: 150, height: 150 }} />}>
          <button type="button" onClick={celebrate} aria-label="You, wearing your outfit — tap to cheer" style={{ border: "none", background: "rgb(var(--mg-ink-rgb) / 0.04)", borderRadius: 14, padding: 0, cursor: "pointer" }}>
            <CharacterModel stage={stage} src={TRAINER_MODEL} figure="trainer" wear={worn_trainer} size={150} animation="idle" is_wide />
          </button>
          <button type="button" onClick={celebrate} aria-label="Your pet, wearing its outfit — tap" style={{ border: "none", background: "rgb(var(--mg-ink-rgb) / 0.04)", borderRadius: 14, padding: 0, cursor: "pointer" }}>
            <CharacterModel stage={stage} figure="pet" wear={worn_pet} size={150} animation="idle" is_wide />
          </button>
        </Suspense>
      </div>
      <div role="tablist" style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {(["trainer", "pet"] as WearFigure[]).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={figure === f}
            onClick={() => setFigure(f)}
            style={{
              flex: 1,
              padding: "7px 0",
              borderRadius: 999,
              border: "1.5px solid var(--mg-green)",
              background: figure === f ? "var(--mg-green)" : "transparent",
              color: figure === f ? "#fff" : "var(--mg-green)",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {f === "trainer" ? "You" : "Your pet"}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        {row.map((item) => {
          const is_owned = owned.has(item.wear_id);
          const is_on = outfit[item.slot] === item.wear_id && is_owned;
          return (
            <div key={item.wear_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid rgb(var(--mg-ink-rgb) / 0.08)", opacity: is_owned || item.source === "shop" ? 1 : 0.55 }}>
              <span aria-hidden style={{ width: 26, height: 26, borderRadius: 8, background: item.accent, boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.6)", flex: "none" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>
                  {is_owned || item.source === "shop" ? item.name : "?"}
                  {is_on && <span style={{ color: "var(--mg-green)", fontSize: 11.5 }}> · on</span>}
                </div>
                <div style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.62)" }}>
                  {SLOT_LABEL[item.slot]} · {is_owned ? item.blurb : SOURCE_LINE[item.source]}
                </div>
              </div>
              {is_owned ? (
                <button type="button" onClick={() => wear(item)} style={button(is_on ? "ghost" : "solid")}>
                  {is_on ? "Take off" : "Wear"}
                </button>
              ) : item.source === "shop" && item.price !== null ? (
                <button type="button" onClick={() => buy(item)} disabled={balance < item.price} style={{ ...button("gold"), opacity: balance < item.price ? 0.45 : 1 }}>
                  {item.price} pts
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {said && <p style={{ fontSize: 12, fontWeight: 700, margin: "8px 0 0" }}>{said}</p>}
      <p style={{ fontSize: 11, lineHeight: 1.4, marginTop: 10, color: "rgb(var(--mg-ink-rgb) / 0.7)" }}>
        One per slot. Charms come from blind boxes and the pet's pieces from growing it; the shop spends points without taking them off your level. Cosmetic only.
      </p>
    </Card>
  );
}

function button(tone: "solid" | "ghost" | "gold") {
  return {
    flexShrink: 0,
    padding: "7px 13px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12.5,
    cursor: "pointer",
    border: tone === "gold" ? "1.5px solid var(--mg-gold, #F0B429)" : "1.5px solid var(--mg-green)",
    background: tone === "solid" ? "var(--mg-green)" : tone === "gold" ? "var(--mg-gold, #F0B429)" : "transparent",
    color: tone === "solid" ? "#fff" : tone === "gold" ? "#3B2A07" : "var(--mg-green)",
  } as const;
}
