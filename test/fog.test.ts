import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import {
  filenameToTile,
  tileToFilename,
  parseTile,
  countVisited,
  tilesToGeoJson,
  geoJsonBbox,
  globalPixelToLngLat,
} from "../src/index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(__dirname, "fixtures", name));

describe("filename decode + round-trip", () => {
  it("decodes the two benchmark fixtures", () => {
    const a = filenameToTile("23e4lltkkoke");
    expect(a.id).toBe(117660);
    expect(a.x).toBe(412);
    expect(a.y).toBe(229);

    const b = filenameToTile("cd36lltksiwo");
    expect(b.id).toBe(117659);
    expect(b.x).toBe(411);
    expect(b.y).toBe(229);
  });

  it("round-trips", () => {
    expect(tileToFilename(117660)).toBe("23e4lltkkoke");
    expect(tileToFilename(117659)).toBe("cd36lltksiwo");
  });
});

describe("parseTile + countVisited", () => {
  it("matches the upstream 36983 benchmark", () => {
    const t1 = parseTile("23e4lltkkoke", fixture("23e4lltkkoke"));
    const t2 = parseTile("cd36lltksiwo", fixture("cd36lltksiwo"));
    expect(t1.tileX).toBe(412);
    expect(t1.tileY).toBe(229);
    expect(t2.tileX).toBe(411);
    expect(t2.tileY).toBe(229);

    const total = countVisited(t1) + countVisited(t2);
    expect(total).toBe(36983);
  });

  it("populates blocks with bitmaps and region codes", () => {
    const t1 = parseTile("23e4lltkkoke", fixture("23e4lltkkoke"));
    expect(t1.blocks.length).toBe(54);
    expect(t1.blocks[0].bitmap.byteLength).toBe(512);
    expect(t1.blocks[0].region).toHaveLength(2);
  });
});

describe("globalPixelToLngLat", () => {
  it("projects tile (412, 229) NW corner into the Hainan area", () => {
    const [lng, lat] = globalPixelToLngLat(412 * 8192, 229 * 8192);
    expect(lng).toBeGreaterThan(109);
    expect(lng).toBeLessThan(110.5);
    expect(lat).toBeGreaterThan(18);
    expect(lat).toBeLessThan(20);
  });
});

describe("tilesToGeoJson", () => {
  it("emits a fog + explored feature collection", () => {
    const t1 = parseTile("23e4lltkkoke", fixture("23e4lltkkoke"));
    const t2 = parseTile("cd36lltksiwo", fixture("cd36lltksiwo"));
    const fc = tilesToGeoJson([t1, t2]);

    const fog = fc.features.find(
      (f) => (f.properties as { kind?: string })?.kind === "fog",
    );
    const explored = fc.features.filter(
      (f) => (f.properties as { kind?: string })?.kind === "explored",
    );
    expect(fog).toBeTruthy();
    expect(explored.length).toBeGreaterThan(0);

    const bbox = geoJsonBbox(fc)!;
    expect(bbox[0]).toBeGreaterThan(108);
    expect(bbox[2]).toBeLessThan(112);
    expect(bbox[1]).toBeGreaterThan(18);
    expect(bbox[3]).toBeLessThan(19);
  });
});
