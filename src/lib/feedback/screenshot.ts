/**
 * Client-side screenshot helpers for beta bug reports.
 * Paste from clipboard, compress to JPEG, optional viewport capture.
 */

import { FEEDBACK_SCREENSHOT_MAX_BYTES } from "@/lib/feedback/screenshot-limits";

export { FEEDBACK_SCREENSHOT_MAX_BYTES } from "@/lib/feedback/screenshot-limits";

export const FEEDBACK_SCREENSHOT_MAX_EDGE = 1600;
export const FEEDBACK_SCREENSHOT_JPEG_QUALITY = 0.72;

export type FeedbackScreenshot = {
  dataUrl: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteEstimate: number;
};

function dataUrlByteEstimate(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

function parseDataUrl(dataUrl: string): {
  contentType: string;
  base64: string;
} | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return { contentType: match[1]!, base64: match[2]! };
}

export function isFeedbackScreenshotDataUrl(value: string): boolean {
  return Boolean(parseDataUrl(value));
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image"));
    };
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

/**
 * Downscale + JPEG-encode for a lean feedback attachment.
 */
export async function compressScreenshot(
  source: Blob | string,
): Promise<FeedbackScreenshot> {
  const dataUrl =
    typeof source === "string" ? source : await blobToDataUrl(source);
  const img = await loadImage(dataUrl);
  const maxEdge = FEEDBACK_SCREENSHOT_MAX_EDGE;
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height, 1));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let quality = FEEDBACK_SCREENSHOT_JPEG_QUALITY;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (
    dataUrlByteEstimate(out) > FEEDBACK_SCREENSHOT_MAX_BYTES &&
    quality > 0.4
  ) {
    quality -= 0.08;
    out = canvas.toDataURL("image/jpeg", quality);
  }

  if (dataUrlByteEstimate(out) > FEEDBACK_SCREENSHOT_MAX_BYTES) {
    throw new Error("Screenshot is too large. Try a smaller crop.");
  }

  return {
    dataUrl: out,
    contentType: "image/jpeg",
    byteEstimate: dataUrlByteEstimate(out),
  };
}

export async function screenshotFromClipboardEvent(
  event: ClipboardEvent,
): Promise<FeedbackScreenshot | null> {
  const items = event.clipboardData?.items;
  if (!items?.length) return null;

  for (const item of Array.from(items)) {
    if (!item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) continue;
    return compressScreenshot(file);
  }
  return null;
}

export async function screenshotFromFile(
  file: File,
): Promise<FeedbackScreenshot> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }
  return compressScreenshot(file);
}

/**
 * Capture the visible viewport with html-to-image.
 * Hides elements marked [data-feedback-modal] so the dialog is not in the shot.
 */
export async function captureViewportScreenshot(): Promise<FeedbackScreenshot> {
  const { toJpeg } = await import("html-to-image");
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

  const dataUrl = await toJpeg(document.documentElement, {
    quality: FEEDBACK_SCREENSHOT_JPEG_QUALITY,
    pixelRatio,
    width,
    height,
    cacheBust: true,
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true;
      if (node.dataset.feedbackModal != null) return false;
      if (node.closest?.("[data-feedback-modal]")) return false;
      return true;
    },
    style: {
      transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`,
      width: `${document.documentElement.scrollWidth}px`,
      height: `${document.documentElement.scrollHeight}px`,
    },
  });

  if (!dataUrl?.startsWith("data:image")) {
    throw new Error("Capture returned an empty image");
  }
  return compressScreenshot(dataUrl);
}
