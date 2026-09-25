import { useCallback, useEffect, useRef, useState } from "react";

/** Long edge of a saved frame. Keeps localStorage small and the CV upload quick. */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.82;

export type CameraStatus = "idle" | "starting" | "live" | "denied" | "unsupported" | "failed";

export interface Shot {
  blob: Blob;
  data_url: string;
}

function isSecure(): boolean {
  return window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function canUseCamera(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia) && isSecure();
}

/** Draw the current video frame, downscaled, as a JPEG. */
export async function grabFrame(video: HTMLVideoElement): Promise<Shot | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const data_url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return null;
  return { blob, data_url };
}

/** Re-encode a picked file through the same downscale path as a live frame. */
export async function shotFromFile(file: File): Promise<Shot> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, data_url: url };
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data_url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    return { blob: blob ?? file, data_url };
  } catch {
    const data_url = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    });
    return { blob: file, data_url };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function statusLine(status: CameraStatus): string {
  if (status === "starting") return "Opening the camera…";
  if (status === "denied") return "Camera permission denied. Pick a photo from this device instead.";
  if (status === "unsupported")
    return "No camera available here (or the page is not on HTTPS). Pick a photo from this device instead.";
  if (status === "failed") return "The camera stream stopped. Try again, or pick a photo from this device.";
  return "";
}

/**
 * Live rear-camera viewfinder with a hard fallback.
 *
 * The stream is torn down on unmount and whenever a frame is kept, so the
 * indicator light never stays on behind a sheet.
 */
export default function Viewfinder({
  shot,
  onShot,
  onClear,
}: {
  shot: Shot | null;
  onShot: (shot: Shot) => void;
  onClear: () => void;
}) {
  const video_ref = useRef<HTMLVideoElement | null>(null);
  const stream_ref = useRef<MediaStream | null>(null);
  const file_ref = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");

  const stop = useCallback(() => {
    stream_ref.current?.getTracks().forEach((t) => t.stop());
    stream_ref.current = null;
    if (video_ref.current) video_ref.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    if (!canUseCamera()) {
      setStatus("unsupported");
      return;
    }
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      stream_ref.current = stream;
      const video = video_ref.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      setStatus("live");
    } catch (err) {
      const name = (err as DOMException)?.name;
      setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed");
    }
  }, []);

  useEffect(() => stop, [stop]);

  const capture = async () => {
    const video = video_ref.current;
    if (!video) return;
    const next = await grabFrame(video);
    if (!next) {
      setStatus("failed");
      return;
    }
    stop();
    setStatus("idle");
    onShot(next);
  };

  const message = statusLine(status);

  return (
    <div>
      <div
        className="gm-viewfinder"
        style={{
          position: "relative",
          aspectRatio: "4 / 3",
          borderRadius: 20,
          overflow: "hidden",
          background: "linear-gradient(160deg,#3d5a34,#25391f)",
        }}
      >
        {shot ? (
          <img src={shot.data_url} alt="Your sighting photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <video
            ref={video_ref}
            playsInline
            muted
            aria-label="Camera viewfinder"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: status === "live" ? "block" : "none",
            }}
          />
        )}
        {!shot && status !== "live" && (
          <div className="absolute inset-0" style={{ display: "grid", placeItems: "center", padding: 20 }}>
            <div style={{ textAlign: "center", color: "#F9F9F9" }}>
              <div style={{ width: 92, height: 92, border: "2px solid rgba(249,249,249,0.5)", borderRadius: 10, margin: "0 auto 12px" }} />
              <div style={{ fontSize: 12.5, lineHeight: 1.4, maxWidth: 260 }}>
                {message || "Point the camera at the leaves, bark, or whole crown."}
              </div>
            </div>
          </div>
        )}
        {status === "live" && (
          <div
            className="absolute"
            style={{ top: 10, left: 10, background: "rgba(31,32,34,0.6)", color: "#F9F9F9", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6 }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "#00E800" }} />
            LIVE
          </div>
        )}
      </div>

      <div className="flex gap-2" style={{ marginTop: 10 }}>
        {shot ? (
          <button
            type="button"
            onClick={() => {
              onClear();
              void start();
            }}
            style={{ flex: 1, height: 44, borderRadius: 12, border: "1.5px solid #E4E7E8", fontWeight: 700, fontSize: 14 }}
          >
            Retake
          </button>
        ) : status === "live" ? (
          <button
            type="button"
            onClick={capture}
            style={{ flex: 1, height: 44, borderRadius: 12, background: "#008653", color: "#fff", fontWeight: 700, fontSize: 14 }}
          >
            Capture
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            style={{ flex: 1, height: 44, borderRadius: 12, background: "#008653", color: "#fff", fontWeight: 700, fontSize: 14 }}
          >
            {status === "starting" ? "Opening…" : "Open camera"}
          </button>
        )}
        <button
          type="button"
          onClick={() => file_ref.current?.click()}
          style={{ height: 44, padding: "0 16px", borderRadius: 12, border: "1.5px solid #E4E7E8", fontWeight: 700, fontSize: 14 }}
        >
          Choose photo
        </button>
        <input
          ref={file_ref}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(ev) => {
            const file = ev.target.files?.[0];
            if (!file) return;
            stop();
            setStatus("idle");
            void shotFromFile(file).then(onShot);
            ev.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
