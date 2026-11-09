// =====================================================================
// imageLimits — the app-side mirror of genumsolutions-website/lib/image-limits.ts.
//
// Both clients write to the same Supabase project on the free plan (1 GB
// Storage, 5 GB egress/month), so both must enforce the same budget or the
// smaller client silently undoes the other's discipline. The website owns
// the encoder (sharp); the app only needs the numbers and the gallery clamp,
// because every image the app stores arrives through the `link-import` edge
// function, which re-encodes with imagescript.
//
// Guarded by src/lib/imageLimits.test.ts, which reads the website file and
// fails if the numbers drift apart. See docs/STORAGE_BUDGET.md.
// =====================================================================

export const IMAGE_BUDGET = {
  /** Largest file accepted from an upload or an import download. */
  maxUploadBytes: 8 * 1024 * 1024,
  /** Long-edge ceiling for anything stored. */
  maxEdge: 1600,
  /** Hard ceiling for a stored file. */
  maxStoredBytes: 300 * 1024,
  /** WebP quality used first by the website encoder. */
  quality: 80,
  /** Floor for the quality search. */
  minQuality: 55,
  /** Images per product (primary + gallery). */
  maxImagesPerItem: 8,
} as const;

/** One-line summary the admin UI shows next to image fields. */
export const IMAGE_BUDGET_HINT =
  "Photos are compressed on save: max 1600 px, ~300 KB each, 8 per item.";

/** Dedupe, drop blanks, keep the first maxImagesPerItem. */
export function clampGallery(urls: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of urls) {
    if (typeof raw !== "string") continue;
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    kept.push(url);
    if (kept.length >= IMAGE_BUDGET.maxImagesPerItem) break;
  }
  return kept;
}
