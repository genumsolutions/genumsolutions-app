# Storage & free-tier budget (app side)

The app and the website write to the same Supabase project on the same free
plan, so the budget is shared. The authoritative document — with the resource
table, measured numbers and maintenance commands — lives in the website repo at
`genumsolutions-website/docs/STORAGE_BUDGET.md`. This file records what the app
is responsible for.

## The numbers

| Rule | Value |
| --- | --- |
| Largest accepted image | 8 MB |
| Stored long edge | ≤ 1600 px |
| Stored bytes | ≤ 300 KB |
| Images per product | 8 |
| Exception | Animated GIFs are stored as-is |

`src/lib/imageLimits.ts` mirrors these values, and
`src/lib/imageLimits.test.ts` reads the website's `lib/image-limits.ts` and
fails if the two ever disagree.

## How the app stays inside it

- **The app never uploads image bytes itself.** A product photo enters the
  project only through the `link-import` edge function, which re-encodes with a
  pure-TypeScript codec (no native dependency, works on the edge runtime) before
  uploading. So one encoder enforces the budget for both clients.
- **Galleries are clamped on write.** `toProductRow()` in
  `src/services/adminService.ts` runs `clampGallery()` before every product
  upsert, so the database cannot receive more than 8 pictures per item even if
  the editor state is stale.
- **Import accepts at most 8 candidates**, and the server skips any download
  over 4 MB with a readable reason instead of failing the whole import.
- **Lists page at 20 rows** (`PAGE_SIZE`) so opening an admin tab does not pull
  a whole table over the network on a metered connection.

## What the app must not add

- No direct `storage.from("product-images").upload()` calls — that bypasses the
  encoder and re-inflates the bucket.
- No full-table selects in admin list screens.
- No polling loops in the admin console; every panel loads on open and on
  explicit navigation.
