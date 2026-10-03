/**
 * Prints the demo seed as JSON so the Django loader (`manage.py seed_demo`)
 * loads exactly what the frontend was designed against — seed.ts stays the
 * single source. Dates are resolved for `--date` (default: today) in the
 * process time zone; the loader sets TZ to the user's zone.
 *
 *   npx tsx scripts/export-seed.ts [--date 2026-10-02]
 */
import { createSeed } from "../lib/mock/seed";

const arg = process.argv.indexOf("--date");
const date = arg > -1 ? process.argv[arg + 1] : null;
if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`Invalid --date "${date}" (expected YYYY-MM-DD)`);
  process.exit(2);
}
const [y, m, d] = date ? date.split("-").map(Number) : [];
// Noon avoids any DST edge when the date is turned into local midnights.
const today = date ? new Date(y, m - 1, d, 12) : new Date();

const pad = (n: number) => String(n).padStart(2, "0");
process.stdout.write(
  JSON.stringify({
    today: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    seed: createSeed(today),
  }),
);
