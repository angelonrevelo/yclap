/**
 * Type declaration for the `<model-viewer>` web component (T4.1).
 *
 * `@google/model-viewer` registers itself as a custom element via a side-effect
 * import; this declaration lets TypeScript recognise the element in JSX. Only
 * the attributes this app actually uses are listed — the full set is documented
 * at model-viewer.dev.
 */
import type { CSSProperties, HTMLAttributes } from "react";

interface ModelViewerAttributes extends HTMLAttributes<HTMLElement> {
  src: string;
  alt?: string;
  /** Idle turntable. Off under prefers-reduced-motion (see CharacterModel). */
  "auto-rotate"?: boolean;
  "camera-controls"?: boolean;
  "shadow-intensity"?: string;
  "shadow-softness"?: string;
  exposure?: string;
  style?: CSSProperties;
}

/* @types/react 19 removed the global JSX namespace — intrinsics resolve
   through the JSX namespace exported from the "react" module, so the
   augmentation must target that module, not `declare global`. */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes;
    }
  }
}
