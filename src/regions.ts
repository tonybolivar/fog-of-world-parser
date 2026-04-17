import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";
import { TILE_WIDTH, BITMAP_WIDTH, type ParsedTile } from "./parseTile";
import { globalPixelToLngLat } from "./project";

type AdminFeature = Feature<Polygon | MultiPolygon, Record<string, unknown>>;

export interface RegionEntry {
  name: string;
  blocks: number;
  bbox: [number, number, number, number];
}

export interface CityEntry {
  name: string;
  lng: number;
  lat: number;
  rank: number;
}

export interface VisitedAdminFeature {
  type: "Feature";
  properties: { name: string; blocks: number };
  geometry: Polygon | MultiPolygon;
}

export interface RegionStats {
  countries: RegionEntry[];
  states: RegionEntry[];
  cities: CityEntry[];
  visitedStates: VisitedAdminFeature[];
  visitedCountries: VisitedAdminFeature[];
}

export interface RegionsInput {
  /**
   * FeatureCollection of country polygons. Optional. Natural Earth's
   * ne_50m_admin_0_countries works well. Caller loads it however they
   * prefer (bundle, fetch, read from disk).
   */
  countries?: FeatureCollection | AdminFeature[] | null;
  /** FeatureCollection of state/province polygons. Optional. */
  states?: FeatureCollection | AdminFeature[] | null;
  /**
   * FeatureCollection of Point features for populated places. Optional.
   * Natural Earth's ne_10m_populated_places_simple works well.
   */
  cities?: FeatureCollection | null;
  /**
   * Block-count threshold below which a country or state is excluded
   * from the output. Filters out brief GPS pings (for example, flyover
   * states the user did not actually visit). Default 10 blocks (about
   * 6 km of coverage).
   */
  minBlocks?: number;
  /**
   * Candidate property keys for the country/state name, tried in order.
   * Defaults cover Natural Earth's common conventions.
   */
  countryNameKeys?: string[];
  stateNameKeys?: string[];
}

const DEFAULT_COUNTRY_KEYS = ["ADMIN", "NAME", "NAME_LONG", "SOVEREIGNT"];
const DEFAULT_STATE_KEYS = ["name", "name_en", "NAME", "gn_name"];

/**
 * Compute country/state/city stats for a set of parsed tiles.
 *
 * The caller supplies the admin polygons. This keeps the package free of
 * network calls and lets users pick their own data source (Natural Earth,
 * US Census TIGER, a custom GeoJSON, etc.).
 */
export function regionsForTiles(
  tiles: ParsedTile[],
  input: RegionsInput = {},
): RegionStats {
  const countryFeats = toAdminFeatures(input.countries);
  const stateFeats = toAdminFeatures(input.states);
  const minBlocks = input.minBlocks ?? 10;
  const countryKeys = input.countryNameKeys ?? DEFAULT_COUNTRY_KEYS;
  const stateKeys = input.stateNameKeys ?? DEFAULT_STATE_KEYS;

  const populatedBlocks = new Set<string>();
  const blockCenters: Position[] = [];
  for (const t of tiles) {
    for (const blk of t.blocks) {
      const gbx = t.tileX * TILE_WIDTH + blk.bx;
      const gby = t.tileY * TILE_WIDTH + blk.by;
      const key = `${gbx},${gby}`;
      if (populatedBlocks.has(key)) continue;
      populatedBlocks.add(key);
      const gx = gbx * BITMAP_WIDTH + BITMAP_WIDTH / 2;
      const gy = gby * BITMAP_WIDTH + BITMAP_WIDTH / 2;
      const [lng, lat] = globalPixelToLngLat(gx, gy);
      blockCenters.push([lng, lat]);
    }
  }

  interface Hit {
    blocks: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }
  const accumulate = (
    map: Map<string, Hit>,
    name: string,
    lng: number,
    lat: number,
  ) => {
    const cur = map.get(name);
    if (cur) {
      cur.blocks++;
      if (lng < cur.minX) cur.minX = lng;
      if (lng > cur.maxX) cur.maxX = lng;
      if (lat < cur.minY) cur.minY = lat;
      if (lat > cur.maxY) cur.maxY = lat;
    } else {
      map.set(name, { blocks: 1, minX: lng, maxX: lng, minY: lat, maxY: lat });
    }
  };

  const countryHits = new Map<string, Hit>();
  const stateHits = new Map<string, Hit>();
  const countryByName = new Map<string, AdminFeature>();
  const stateByName = new Map<string, AdminFeature>();

  for (const [lng, lat] of blockCenters) {
    if (countryFeats.length > 0) {
      const hit = findContainingWithFeat(countryFeats, lng, lat, countryKeys);
      if (hit) {
        accumulate(countryHits, hit.name, lng, lat);
        if (!countryByName.has(hit.name)) countryByName.set(hit.name, hit.feat);
      }
    }
    if (stateFeats.length > 0) {
      const hit = findContainingWithFeat(stateFeats, lng, lat, stateKeys);
      if (hit) {
        accumulate(stateHits, hit.name, lng, lat);
        if (!stateByName.has(hit.name)) stateByName.set(hit.name, hit.feat);
      }
    }
  }

  const byBlocksDesc = (a: { blocks: number }, b: { blocks: number }) =>
    b.blocks - a.blocks;
  const toList = (m: Map<string, Hit>) =>
    [...m.entries()]
      .filter(([, h]) => h.blocks >= minBlocks)
      .map(([name, h]) => ({
        name,
        blocks: h.blocks,
        bbox: [h.minX, h.minY, h.maxX, h.maxY] as [
          number,
          number,
          number,
          number,
        ],
      }))
      .sort(byBlocksDesc);

  const countriesList = toList(countryHits);
  const statesList = toList(stateHits);

  // Cities: one dot gets included if any visited block is within a 5x5
  // block neighborhood (about 3 km radius) of its canonical lng/lat.
  const cities: CityEntry[] = [];
  const citiesFc = input.cities;
  if (citiesFc && Array.isArray(citiesFc.features)) {
    const FULL = 512 * TILE_WIDTH * BITMAP_WIDTH;
    const NEIGHBOR_RADIUS = 2;
    for (const f of citiesFc.features) {
      if (!f.geometry || f.geometry.type !== "Point") continue;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const gx = Math.floor(((lng + 180) / 360) * FULL);
      const latRad = (lat * Math.PI) / 180;
      const gy = Math.floor(
        ((Math.PI - Math.asinh(Math.tan(latRad))) * FULL) / (2 * Math.PI),
      );
      const gbx = Math.floor(gx / BITMAP_WIDTH);
      const gby = Math.floor(gy / BITMAP_WIDTH);
      let hit = false;
      for (let dy = -NEIGHBOR_RADIUS; dy <= NEIGHBOR_RADIUS && !hit; dy++) {
        for (let dx = -NEIGHBOR_RADIUS; dx <= NEIGHBOR_RADIUS && !hit; dx++) {
          if (populatedBlocks.has(`${gbx + dx},${gby + dy}`)) hit = true;
        }
      }
      if (!hit) continue;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const name =
        (props.name as string) ?? (props.NAME as string) ?? (props.name_en as string) ?? "";
      const rank =
        (props.scalerank as number) ?? (props.SCALERANK as number) ?? 99;
      if (!name) continue;
      cities.push({ name, lng, lat, rank });
    }
    cities.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  }

  const adminToFeat = (
    list: RegionEntry[],
    byName: Map<string, AdminFeature>,
  ): VisitedAdminFeature[] =>
    list
      .map((r) => {
        const feat = byName.get(r.name);
        if (!feat) return null;
        return {
          type: "Feature" as const,
          properties: { name: r.name, blocks: r.blocks },
          geometry: feat.geometry,
        };
      })
      .filter((f): f is VisitedAdminFeature => f !== null);

  return {
    countries: countriesList,
    states: statesList,
    cities,
    visitedStates: adminToFeat(statesList, stateByName),
    visitedCountries: adminToFeat(countriesList, countryByName),
  };
}

function toAdminFeatures(
  input: FeatureCollection | AdminFeature[] | null | undefined,
): AdminFeature[] {
  if (!input) return [];
  const features = Array.isArray(input) ? input : input.features;
  return features.filter(
    (f): f is AdminFeature =>
      f != null &&
      f.geometry != null &&
      (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
  );
}

function boundingBoxContains(
  f: AdminFeature,
  lng: number,
  lat: number,
): boolean {
  const bbox = (f.bbox as number[] | undefined) ?? featureBbox(f);
  return lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function featureBbox(f: AdminFeature): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const visit = (r: Position[]) => {
    for (const [x, y] of r) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  };
  if (f.geometry.type === "Polygon") {
    for (const r of f.geometry.coordinates) visit(r);
  } else {
    for (const p of f.geometry.coordinates) for (const r of p) visit(r);
  }
  return [minX, minY, maxX, maxY];
}

function findContainingWithFeat(
  features: AdminFeature[],
  lng: number,
  lat: number,
  nameKeys: string[],
): { name: string; feat: AdminFeature } | null {
  const p = point([lng, lat]);
  for (const f of features) {
    if (!boundingBoxContains(f, lng, lat)) continue;
    if (booleanPointInPolygon(p, f)) {
      for (const k of nameKeys) {
        const v = f.properties[k];
        if (typeof v === "string" && v.length) return { name: v, feat: f };
      }
    }
  }
  return null;
}
