import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(scriptDir, "../src/LeaderboardPanel.jsx");
const source = readFileSync(filePath, "utf8");

const count = (pattern) => (source.match(pattern) || []).length;

const chartTicksCount = count(/\bconst\s+CHART_TICKS\b/g);
const chartAxisTicksCount = count(/\bconst\s+CHART_AXIS_TICKS\b/g);

if (chartTicksCount !== 0 || chartAxisTicksCount !== 1) {
  console.error(
    `LeaderboardPanel constant sanity check failed: CHART_TICKS=${chartTicksCount}, CHART_AXIS_TICKS=${chartAxisTicksCount}`,
  );
  process.exit(1);
}

console.log("LeaderboardPanel constant sanity check passed.");
