/**
 * What a figure wears right now, from this phone's storage — the charms opened
 * (`blindbox.ts`), the stage rewards earned (`cosmetic.ts`), the shop's
 * purchases and the outfit (`wear.ts`). Re-read whenever the outfit changes
 * (`OUTFIT_EVENT`) or another tab writes storage, so the map's trainer, the
 * pet and the wardrobe preview never disagree.
 */
import { useEffect, useState } from "react";
import { charmShelf, readBoxOpen } from "./blindbox";
import { grantedCosmetics } from "./cosmetic";
import { readSighting, seenSector } from "./journal";
import { OUTFIT_EVENT, ownedWear, readOutfit, readPurchase, wornOn, type WearFigure } from "./wear";

export function ownedNow(): Set<string> {
  return ownedWear({
    charm_id: charmShelf(readBoxOpen()).filter((c) => c.count > 0).map((c) => c.cosmetic.id),
    stage_cosmetic_id: grantedCosmetics(seenSector(readSighting()).size).map((c) => c.id),
    purchase: readPurchase(),
  });
}

export function useWorn(figure: WearFigure): string[] {
  const read = () => wornOn(figure, readOutfit(), ownedNow());
  const [worn, setWorn] = useState<string[]>(read);
  useEffect(() => {
    const again = () => setWorn((prev) => {
      const next = read();
      return next.join() === prev.join() ? prev : next;
    });
    window.addEventListener(OUTFIT_EVENT, again);
    window.addEventListener("storage", again);
    return () => {
      window.removeEventListener(OUTFIT_EVENT, again);
      window.removeEventListener("storage", again);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [figure]);
  return worn;
}

/** Fired on window when something worth celebrating happens (a find logged, a level). */
export const CELEBRATE_EVENT = "magi:celebrate";

export function celebrate(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CELEBRATE_EVENT));
}

/** True for `ms` after each celebration — the trainer's cheer, the pet's happy clip. */
export function useCelebrating(ms = 1600): boolean {
  const [is_on, setOn] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const on = () => {
      setOn(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setOn(false), ms);
    };
    window.addEventListener(CELEBRATE_EVENT, on);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, on);
      if (timer) clearTimeout(timer);
    };
  }, [ms]);
  return is_on;
}
