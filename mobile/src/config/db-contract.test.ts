import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// =====================================================================
// Cross-repo database contract guard.
//
// Both clients talk to ONE Supabase project, whose canonical shape is
// `genumsolutions-website/supabase/schema.sql` plus `supabase/migrations/*.sql`.
// The app must never query a table the schema does not define: that is drift
// the TypeScript compiler cannot see, and it fails only at runtime (empty
// panels in production).
//
// Re-run by hand after adding a table from either side. When the website repo
// is not checked out next to the app (CI), only the local half runs.
// =====================================================================

const SCHEMA_DIR = resolve(
  __dirname,
  "../../../../genumsolutions-website/supabase",
);

/** `create table [if not exists] [public.]name (` occurrences. */
function tablesIn(sql: string): string[] {
  const out: string[] = [];
  for (const match of sql.matchAll(
    /create table (?:if not exists )?(?:public\.)?(\w+)\s*\(/gi,
  )) {
    const table = match[1]?.toLowerCase();
    if (table) out.push(table);
  }
  return out;
}

/** Tables the app's source queries via `supabase.from("...")`. */
function tablesUsedByApp(): Map<string, string> {
  const used = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name))
        continue;
      for (const match of readFileSync(path, "utf8").matchAll(
        /\.from\(\s*["'`](\w+)["'`]\s*\)/g,
      )) {
        const table = match[1]?.toLowerCase();
        if (table) used.set(table, path);
      }
    }
  };
  walk(join(__dirname, ".."));
  return used;
}

describe("database contract (app -> shared Supabase schema)", () => {
  it("only queries tables defined in schema.sql or a migration", () => {
    const used = tablesUsedByApp();
    // Sanity: the walker found the data layer rather than nothing.
    expect(used.size).toBeGreaterThan(10);

    const schemaPath = join(SCHEMA_DIR, "schema.sql");
    const migrationsDir = join(SCHEMA_DIR, "migrations");
    if (!existsSync(schemaPath)) return; // website repo absent (CI layout)

    const known = new Set(tablesIn(readFileSync(schemaPath, "utf8")));
    if (existsSync(migrationsDir))
      for (const file of readdirSync(migrationsDir))
        if (file.endsWith(".sql"))
          for (const table of tablesIn(
            readFileSync(join(migrationsDir, file), "utf8"),
          ))
            known.add(table);

    const unknown = [...used]
      .filter(([table]) => !known.has(table))
      .map(([table, path]) => `${table} (${path.split(/[\\/]/).pop()})`);
    expect(unknown).toEqual([]);
  });
});
