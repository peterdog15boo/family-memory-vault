/**
 * Run a Node script, adding `--use-system-ca` only when this Node binary supports it.
 *
 * Local Windows / Node 23.8+ need the flag for corporate TLS.
 * GitHub Actions on Node 22 rejects the flag with exit 9 ("bad option") in ~0s —
 * so CI must omit it while Vercel/local keep the secure CA behavior when available.
 *
 * Usage: node ./scripts/node-with-system-ca.mjs <script> [args...]
 */
import { spawnSync } from "node:child_process";

function supportsUseSystemCa() {
  const probe = spawnSync(process.execPath, ["--use-system-ca", "-e", "0"], {
    encoding: "utf8",
  });
  return probe.status === 0;
}

const userArgs = process.argv.slice(2);
if (userArgs.length === 0) {
  console.error(
    "Usage: node ./scripts/node-with-system-ca.mjs <script> [args...]",
  );
  process.exit(1);
}

const nodeArgs = supportsUseSystemCa() ? ["--use-system-ca", ...userArgs] : userArgs;
const result = spawnSync(process.execPath, nodeArgs, {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
