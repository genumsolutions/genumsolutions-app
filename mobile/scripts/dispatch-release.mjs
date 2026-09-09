// =====================================================================
// dispatch-release.mjs - kick the "Release Android APK" workflow from
// the CLI (GitHub's manual "Run workflow" click, automated).
//
// Auth is a Personal Access Token (PAT) with `repo` scope (or a
// fine-grained token with "Actions: Read and write" on the app repo):
//   GitHub -> Settings -> Developer settings -> Personal access tokens
//   -> Tokens (classic) -> Generate new token -> scope `repo`.
//
//   $env:GH_TOKEN = "ghp_..."      (PowerShell, one session)
//   node scripts/dispatch-release.mjs
//
// The token is read from the GH_TOKEN env var or mobile/.env.local
// (which is gitignored). It is NEVER logged.
//
// Usage:
//   node scripts/dispatch-release.mjs                      dispatch release.yml on main
//   node scripts/dispatch-release.mjs --workflow ota-only   dispatch another workflow
//   node scripts/dispatch-release.mjs --ref main            explicit branch
//   node scripts/dispatch-release.mjs --dry-run            show the request only
//
// NOTE: a version bump does NOT need this - release.yml's positive
// `paths` list (mobile/app.json, package*.json, plugins/**, keystores/**)
// already auto-triggers on the bump push. Use this script only to
// re-kick a release that was eaten by a bad CI state (like the paths-ignore
// bug that swallowed the 2.0.3 bump) or for a manual rebuild.
// =====================================================================

const OWNER = 'genumsolutions';
const REPO = 'genumsolutions-app';
const API = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows`;

async function loadEnv() {
  const out = {};
  try {
    const { readFileSync } = await import('node:fs');
    const lines = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* .env.local missing - GH_TOKEN env var only */
  }
  return out;
}

function parseArgs() {
  const args = { workflow: 'release.yml', ref: 'main', dryRun: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--workflow' && argv[i + 1]) args.workflow = argv[++i];
    else if (argv[i] === '--ref' && argv[i + 1]) args.ref = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else console.warn(`Unknown arg: ${argv[i]}`);
  }
  return args;
}

const args = parseArgs();
const env = await loadEnv();
const token = process.env.GH_TOKEN || env.GH_TOKEN;

if (!token) {
  console.error('Missing GH_TOKEN. Set it as an env var or add GH_TOKEN=... to mobile/.env.local (gitignored).');
  console.error('  $env:GH_TOKEN = "ghp_..."   then:  node scripts/dispatch-release.mjs');
  process.exit(1);
}

const url = `${API}/${args.workflow}/dispatches`;
const body = { ref: args.ref };
console.log(`POST ${url}`);
console.log(`  body: ${JSON.stringify(body)}`);

if (args.dryRun) {
  console.log('--dry-run: no request sent.');
  process.exit(0);
}

const res = await fetch(url, {
  method: 'POST',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  },
  body: JSON.stringify(body),
});

if (res.status === 204) {
  console.log(`✔ Dispatched ${args.workflow} on ref ${args.ref}. Watch it at:`);
  console.log(`  https://github.com/${OWNER}/${REPO}/actions/workflows/${args.workflow}`);
} else {
  const text = await res.text();
  console.error(`✘ HTTP ${res.status}: ${text}`);
  process.exit(1);
}