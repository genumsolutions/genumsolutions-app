// =====================================================================
// printAttachments — what the app is allowed to attach to a print quote.
//
// Mirrors genumsolutions-website/lib/print-quote.ts so the app rejects a file
// before a 10 MB upload rather than after the round trip. The website route
// stays the authority (it re-checks every file); this is the same rule set.
// =====================================================================

export const MAX_QUOTE_FILES = 3;
export const MAX_QUOTE_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_QUOTE_EXTENSIONS = [
  "stl",
  "obj",
  "3mf",
  "step",
  "stp",
  "stpz",
  "amf",
  "zip",
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
] as const;

export const QUOTE_FILES_ERROR = `Attach STL, OBJ, 3MF, STEP, ZIP, PDF, JPG, PNG or WebP — up to ${MAX_QUOTE_FILES} files, 10 MB each.`;

export type QuoteAttachment = {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
};

/** Lowercase extension, or null when the type is not accepted. */
export function quoteFileExtension(name: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(String(name ?? "").trim());
  if (!match) return null;
  const ext = (match[1] ?? "").toLowerCase();
  return (ALLOWED_QUOTE_EXTENSIONS as readonly string[]).includes(ext)
    ? ext
    : null;
}

export type AttachmentCheck = { ok: true } | { ok: false; error: string };

/** Validate the whole selection before submitting. */
export function checkQuoteAttachments(
  files: QuoteAttachment[],
): AttachmentCheck {
  if (files.length > MAX_QUOTE_FILES)
    return { ok: false, error: `Attach up to ${MAX_QUOTE_FILES} files.` };
  for (const file of files) {
    if (!quoteFileExtension(file.name))
      return { ok: false, error: QUOTE_FILES_ERROR };
    if (Number(file.size) > MAX_QUOTE_FILE_BYTES)
      return { ok: false, error: `${file.name} is larger than 10 MB.` };
    if (!file.uri)
      return { ok: false, error: `${file.name} could not be read.` };
  }
  return { ok: true };
}

/** Native fetch accepts a {uri, name, type} object as a FormData part. */
export function attachmentFormPart(file: QuoteAttachment) {
  return {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || "application/octet-stream",
  };
}

/** "2 files · 3.4 MB" for the composer, so the limit is visible. */
export function attachmentSummary(files: QuoteAttachment[]): string {
  if (files.length === 0) return "No files attached";
  const bytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
  const mb = Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return `${files.length} file${files.length === 1 ? "" : "s"} · ${mb} MB`;
}
