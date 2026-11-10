// =====================================================================
// serve-web.mjs — serve the `expo export --platform web` output so the
// Playwright smoke test has something to load.
//
// Deliberately dependency-free: `dist/` is a folder of static files and
// the only clever bit we need is an SPA fallback to index.html. Adding a
// static-server package for that would be a heavier dependency than the
// whole job.
//
// Usage: node scripts/serve-web.mjs      (PORT env overrides 4173)
// =====================================================================
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../dist/", import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);
const HOST = "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** Resolve a URL path to a real file inside dist/, or null. */
async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0] ?? "/").replace(
    /^\/+/,
    "",
  );
  const candidate = join(ROOT, normalize(clean));
  // Never serve outside dist/ (a request like /../../etc/passwd).
  if (!candidate.startsWith(ROOT)) return null;
  try {
    const info = await stat(candidate);
    if (info.isFile()) return candidate;
  } catch {
    return null;
  }
  return null;
}

createServer(async (req, res) => {
  // SPA fallback: React Navigation keeps routes in memory, so any unknown
  // path still needs the shell HTML to boot.
  const file = (await resolveFile(req.url ?? "/")) ?? join(ROOT, "index.html");
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("dist/ not found — run: npx expo export --platform web");
  }
}).listen(PORT, HOST, () => {
  console.log(`serving dist/ on http://${HOST}:${PORT}`);
});
