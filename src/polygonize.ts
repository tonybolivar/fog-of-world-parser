import polygonClipping from "polygon-clipping";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Position,
} from "geojson";
import { TILE_WIDTH, BITMAP_WIDTH, type ParsedTile } from "./parseTile";
import { globalPixelToLngLat } from "./project";

/**
 * Two output layers:
 *   "explored" : one Polygon Feature per connected component of visited
 *                blocks, unioned via polygon-clipping.
 *   "fog"      : one MultiPolygon Feature covering the world with the
 *                explored components cut out as holes.
 */

const COORD_PRECISION = 5;

type BlockKey = string;
const makeKey = (gbx: number, gby: number): BlockKey => `${gbx},${gby}`;

function roundCoord(n: number): number {
  const p = Math.pow(10, COORD_PRECISION);
  return Math.round(n * p) / p;
}

export function tilesToGeoJson(tiles: ParsedTile[]): FeatureCollection {
  const exploredCoords = buildExploredMultiPolygon(tiles);
  const fogCoords = buildFogMultiPolygon(exploredCoords.map((e) => e.poly));

  const exploredFeatures: Feature[] = exploredCoords.map((item, i) => ({
    type: "Feature",
    properties: { kind: "explored", id: i, blocks: item.blocks },
    geometry: { type: "Polygon", coordinates: item.poly },
  }));
  const fog: Feature<MultiPolygon> = {
    type: "Feature",
    properties: { kind: "fog" },
    geometry: { type: "MultiPolygon", coordinates: fogCoords },
  };
  return { type: "FeatureCollection", features: [fog, ...exploredFeatures] };
}

function buildExploredMultiPolygon(
  tiles: ParsedTile[],
): Array<{ poly: Position[][]; blocks: number }> {
  const populated = new Map<BlockKey, [number, number]>();
  for (const t of tiles) {
    for (const blk of t.blocks) {
      const gbx = t.tileX * TILE_WIDTH + blk.bx;
      const gby = t.tileY * TILE_WIDTH + blk.by;
      populated.set(makeKey(gbx, gby), [gbx, gby]);
    }
  }

  // 4-connected BFS into components so the polygon-clipping union only
  // runs on blocks that can actually merge.
  const seen = new Set<BlockKey>();
  const components: Array<Array<[number, number]>> = [];
  for (const [key] of populated) {
    if (seen.has(key)) continue;
    const comp: Array<[number, number]> = [];
    const queue: BlockKey[] = [key];
    seen.add(key);
    while (queue.length) {
      const k = queue.shift()!;
      const c = populated.get(k)!;
      comp.push(c);
      const [x, y] = c;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nk = makeKey(x + dx, y + dy);
        if (!seen.has(nk) && populated.has(nk)) {
          seen.add(nk);
          queue.push(nk);
        }
      }
    }
    components.push(comp);
  }

  const out: Array<{ poly: Position[][]; blocks: number }> = [];
  for (const comp of components) {
    const rects = comp.map(([gbx, gby]) => [blockRectLngLat(gbx, gby)]);
    if (rects.length === 0) continue;
    try {
      const [first, ...rest] = rects as unknown as Parameters<
        typeof polygonClipping.union
      >;
      const unioned = polygonClipping.union(
        first,
        ...rest,
      ) as unknown as Position[][][];
      const perPolyBlocks =
        unioned.length === 1
          ? comp.length
          : Math.max(1, Math.round(comp.length / unioned.length));
      for (const poly of unioned) out.push({ poly, blocks: perPolyBlocks });
    } catch {
      for (const r of rects) out.push({ poly: r, blocks: 1 });
    }
  }
  return out;
}

// Web Mercator clips at ~85.05 degrees.
const WORLD_POLY: Position[][] = [
  [
    [-180, -85.05],
    [180, -85.05],
    [180, 85.05],
    [-180, 85.05],
    [-180, -85.05],
  ],
];

function buildFogMultiPolygon(explored: Position[][][]): Position[][][] {
  if (explored.length === 0) return [WORLD_POLY];
  try {
    type DiffArgs = Parameters<typeof polygonClipping.difference>;
    const [first, ...rest] = [
      WORLD_POLY,
      ...explored,
    ] as unknown as DiffArgs;
    const diff = polygonClipping.difference(
      first,
      ...rest,
    ) as unknown as Position[][][];
    return diff;
  } catch {
    return [WORLD_POLY];
  }
}

function blockRectLngLat(gbx: number, gby: number): Position[] {
  const gxW = gbx * BITMAP_WIDTH;
  const gxE = (gbx + 1) * BITMAP_WIDTH;
  const gyN = gby * BITMAP_WIDTH;
  const gyS = (gby + 1) * BITMAP_WIDTH;
  const [lngW, latN] = globalPixelToLngLat(gxW, gyN);
  const [lngE, latS] = globalPixelToLngLat(gxE, gyS);
  const W = roundCoord(lngW);
  const E = roundCoord(lngE);
  const N = roundCoord(latN);
  const S = roundCoord(latS);
  return [
    [W, N],
    [W, S],
    [E, S],
    [E, N],
    [W, N],
  ];
}

/** Bounding box of explored features (skips the fog feature). */
export function geoJsonBbox(
  fc: FeatureCollection,
): [number, number, number, number] | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let seen = false;
  for (const f of fc.features) {
    if ((f.properties as { kind?: string } | null)?.kind !== "explored") continue;
    if (f.geometry.type === "Polygon") {
      for (const ring of f.geometry.coordinates) {
        for (const [x, y] of ring) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          seen = true;
        }
      }
    }
  }
  return seen ? [minX, minY, maxX, maxY] : null;
}
