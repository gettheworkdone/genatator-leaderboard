import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(scriptDir, "../src/LeaderboardPanel.jsx");

const original = readFileSync(filePath, "utf8");

let next = original
  .replace(/^\s*const\s+CHART_TICKS\s*=.*$/gm, "")
  .replace(/^\s*const\s+CHART_AXIS_TICKS\s*=.*$/gm, "");

if (!next.includes("const METRIC_LABELS = {")) {
  console.error("sanitize-leaderboard-panel: could not locate METRIC_LABELS anchor");
  process.exit(1);
}

next = next.replace(
  /\nconst METRIC_LABELS = \{/,
  "\nconst CHART_AXIS_TICKS = Object.freeze([0, 150, 250, 350, 500]);\n\nconst METRIC_LABELS = {",
);

next = next.replace(/\n{3,}/g, "\n\n");

if (next !== original) {
  writeFileSync(filePath, next, "utf8");
  console.log("LeaderboardPanel sanitized.");
} else {
  console.log("LeaderboardPanel already clean.");
}
