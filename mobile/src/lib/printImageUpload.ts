// =====================================================================
// printImageUpload — what the app may upload as a print gallery image.
//
// The website's admin upload route accepts JPG/PNG/WebP/AVIF/GIF up to 8 MB
// and stores into the public `product-images` bucket (staff-write policy).
// The app uploads straight to the same bucket, so it applies the same rules
// here before spending a mobile connection on the bytes.
// =====================================================================
import { IMAGE_BUDGET } from "./imageLimits";

export const PRINT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

/** Storage extension for each accepted mime type. */
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export const PRINT_IMAGE_MAX_BYTES = IMAGE_BUDGET.maxUploadBytes;

export const PRINT_IMAGE_ERROR =
  "Use a JPG, PNG, WebP, AVIF or GIF image smaller than 8 MB.";

export type PrintImageCheck =
  | { ok: true; extension: string; contentType: string }
  | { ok: false; error: string };

/** Validate one picked file before upload. */
export function checkPrintImage(file: {
  name?: string;
  size?: number;
  mimeType?: string;
}): PrintImageCheck {
  const mime = String(file.mimeType ?? "").toLowerCase();
  const extensionFromMime = EXTENSION_BY_MIME[mime];
  const match = /\.([a-z0-9]+)$/i.exec(String(file.name ?? "").trim());
  const extension = (match?.[1] ?? "").toLowerCase();
  const validExtension =
    extension === "jpg" || extension === "jpeg"
      ? "jpg"
      : (PRINT_IMAGE_MIME_TYPES as readonly string[]).includes(
            `image/${extension}`,
          )
        ? extension
        : null;

  if (!extensionFromMime && !validExtension)
    return { ok: false, error: PRINT_IMAGE_ERROR };
  if (Number(file.size) > PRINT_IMAGE_MAX_BYTES) {
    return { ok: false, error: "That image is larger than 8 MB." };
  }
  return {
    ok: true,
    extension: extensionFromMime ?? (validExtension as string),
    contentType: (PRINT_IMAGE_MIME_TYPES as readonly string[]).includes(mime)
      ? mime
      : `image/${validExtension === "jpg" ? "jpeg" : validExtension}`,
  };
}
