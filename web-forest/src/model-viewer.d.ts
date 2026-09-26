/**
 * Type declaration for the `<model-viewer>` web component (T4.1).
 *
 * `@google/model-viewer` registers itself as a custom element via a side-effect
 * import; this declaration lets TypeScript recognise the element in JSX. Only
 * the attributes this app actually uses are listed — the full set is documented
 * at model-viewer.dev.
 */
import type { CSSProperties, HTMLAttributes, Key, Ref } from "react";

interface ModelViewerAttributes extends HTMLAttributes<HTMLElement> {
  src: string;
  alt?: string;
  /** Idle turntable. Off under prefers-reduced-motion (see CharacterModel). */
  "auto-rotate"?: boolean;
  "camera-controls"?: boolean;
  "shadow-intensity"?: string;
  "shadow-softness"?: string;
  exposure?: string;
  /** Plays the model's embedded clip (the species pack's looping "idle"). */
  autoplay?: boolean;
  /** "none" hides the hand-wave hint that model-viewer shows over a still model. */
  "interaction-prompt"?: string;
  /** "<theta> <phi> <radius>" — where the camera sits around the model. */
  "camera-orbit"?: string;
  "field-of-view"?: string;
  /** Upper bound on the orbit — the radius defaults to "auto", which clamps a pulled-back camera. */
  "max-camera-orbit"?: string;
  /** "<roll> <pitch> <yaw>" — turns the model itself, e.g. to face its heading. */
  orientation?: string;
  "environment-image"?: string;
  "disable-zoom"?: boolean;
  "disable-pan"?: boolean;
  "animation-name"?: string;
  "time-scale"?: string;
  /** "eager" | "lazy" | "auto". */
  loading?: string;
  /** Listeners for `load` / `error` are attached through the ref (see SpeciesCard). */
  ref?: Ref<HTMLElement>;
  key?: Key | null;
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
