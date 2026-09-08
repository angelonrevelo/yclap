import { KIND_LABEL, type Kind } from "./kind";
import { RADIUS } from "./ui";

/**
 * The drawing half of `kind.ts` — one schematic shape and one tone per taxon
 * group, in its own module so both the list strip and the map marker use the
 * same eleven shapes. A bird that is a bird on the card and a dot on the map
 * is two different claims about the same find.
 */

export const KIND_TONE: Record<Kind, string> = {
  plant: "#3F8F4E",
  tree: "#2F6B3A",
  fungus: "#9A6B2F",
  bracket: "#7E5A2B",
  insect: "#B0842A",
  butterfly: "#C0761F",
  spider: "#6B5E4A",
  bird: "#2E7EA6",
  reptile: "#4C7A48",
  amphibian: "#3E8A7A",
  fish: "#2A6E9E",
  mollusc: "#8A7A5C",
  mammal: "#7A5C46",
  other: "#6C7276",
};

/** One shape per group. Deliberately schematic — a drawing that tried to look
 *  like the species would be inventing a field mark we did not observe. */
export function KindPath({ kind }: { kind: Kind }) {
  switch (kind) {
    case "tree":
      return <path d="M12 20V13M12 13c-4 0-6-2.4-6-5.2C6 5.2 8.4 3 12 3s6 2.2 6 4.8C18 10.6 16 13 12 13Z" />;
    case "plant":
      return <path d="M12 21V9M12 12c-4 0-6-2-6-5 3.4 0 6 1.6 6 5Zm0-1c0-3.6 2.6-5.6 6-5.6 0 3.2-2 5.6-6 5.6Z" />;
    case "fungus":
      return <path d="M6 11a6 6 0 0 1 12 0Zm4 0v6a2 2 0 0 0 4 0v-6" />;
    case "bracket":
      return <path d="M5 15V6m0 4h4a6 4 0 0 1 6 4H5Z" />;
    case "butterfly":
      return <path d="M12 6v12M12 9C9.5 5 4 4.5 4 9s5 4 8 3Zm0 0c2.5-4 8-4.5 8 0s-5 4-8 3Z" />;
    case "insect":
      return <path d="M12 5v14M9 8H5M9 12H4M9 16H5M15 8h4M15 12h5M15 16h4" />;
    case "spider":
      return <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM9 10 5 7M9 14l-4 3M15 10l4-3m-4 7 4 3" />;
    case "bird":
      return <path d="M5 15c3.5 0 7-2.2 9-6 1.6 3.2 3 4.6 5 5-1.4 3.6-4.6 6-9 6-3 0-5-1.6-5-5Zm11-6 2.5-2" />;
    case "reptile":
      return <path d="M4 14c2-3 5-4 8-4s5 1 7 3M7 14l-2 3m6-3v3m5-3 2 3" />;
    case "amphibian":
      return <path d="M6 14a6 5 0 0 1 12 0ZM8 8.5v.01M16 8.5v.01M5 16l-2 3m18-3 2 3" />;
    case "fish":
      return <path d="M4 12c3-4 8-4 11 0-3 4-8 4-11 0Zm11 0 5-3v6ZM8 11v.01" />;
    case "mollusc":
      return <path d="M13 16a5 5 0 1 0-4-8M4 17h9M6 8V6m3 2V5" />;
    case "mammal":
      return <path d="M5 17c0-4 3-7 7-7s7 3 7 7ZM8 8 6 4m10 4 2-4" />;
    default:
      return <circle cx="12" cy="12" r="6" />;
  }
}

/**
 * The thumbnail for a find with no curated artwork.
 *
 * It states the group and nothing more, which is exactly as much as the sweep
 * told us. `TaxonThumb` still handles the 25 species we DID draw.
 */
export function KindThumb({ kind, size = 44 }: { kind: Kind; size?: number }) {
  const tone = KIND_TONE[kind];
  return (
    <div
      title={KIND_LABEL[kind]}
      aria-label={KIND_LABEL[kind]}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: RADIUS.pill,
        background: `color-mix(in srgb, ${tone} 12%, transparent)`,
        border: `2px solid color-mix(in srgb, ${tone} 40%, transparent)`,
        display: "grid",
        placeItems: "center",
      }}
    >
      <svg
        width={size * 0.56}
        height={size * 0.56}
        viewBox="0 0 24 24"
        fill="none"
        stroke={tone}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <KindPath kind={kind} />
      </svg>
    </div>
  );
}

