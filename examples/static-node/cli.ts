/**
 * CLI: read every file in a local Sync directory, parse each as a Fog of
 * World tile, write a GeoJSON FeatureCollection to stdout or to a file.
 *
 * Usage:
 *   npx tsx cli.ts <sync-dir> [output.geojson]
 *
 * Example:
 *   npx tsx cli.ts ~/Dropbox/Apps/Fog\ of\ World/Sync travels.geojson
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseTile,
  tilesToGeoJson,
  countVisited,
  geoJsonBbox,
} from "fog-of-world-parser";

const [, , syncDir, outPath] = process.argv;
if (!syncDir) {
  console.error("usage: cli.ts <sync-dir> [output.geojson]");
  process.exit(1);
}

const root = resolve(syncDir);
const files = readdirSync(root).filter((f) => /^[a-z0-9]+$/.test(f));
console.error(`found ${files.length} candidate tile file(s) in ${root}`);

const tiles = [];
let skipped = 0;
for (const name of files) {
  try {
    const bytes = readFileSync(resolve(root, name));
    tiles.push(parseTile(name, bytes));
  } catch (err) {
    skipped++;
    console.error(`skip ${name}: ${(err as Error).message}`);
  }
}

const fc = tilesToGeoJson(tiles);
const bbox = geoJsonBbox(fc);
const visitedPixels = tiles.reduce((s, t) => s + countVisited(t), 0);

const payload = {
  ...fc,
  metadata: {
    generatedAt: new Date().toISOString(),
    tileCount: tiles.length,
    skipped,
    visitedPixelCount: visitedPixels,
    bbox,
  },
};

const json = JSON.stringify(payload);
if (outPath) {
  writeFileSync(outPath, json);
  console.error(
    `wrote ${outPath} (${json.length} bytes, ${visitedPixels.toLocaleString()} visited cells)`,
  );
} else {
  process.stdout.write(json);
}
