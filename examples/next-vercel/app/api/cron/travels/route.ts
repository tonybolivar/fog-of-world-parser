import { put } from "@vercel/blob";
import {
  parseTile,
  countVisited,
  tilesToGeoJson,
  geoJsonBbox,
  regionsForTiles,
} from "fog-of-world-parser";
import { fetchTileFiles } from "@/lib/sources/source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BLOB_KEY = "travels/latest.json";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  const files = await fetchTileFiles();
  const tiles = [];
  for (const f of files) {
    try {
      tiles.push(parseTile(f.name, f.bytes));
    } catch {
      // skip unparseable files
    }
  }

  const fc = tilesToGeoJson(tiles);
  const bbox = geoJsonBbox(fc);
  const visitedPixelCount = tiles.reduce((s, t) => s + countVisited(t), 0);

  // Region stats are optional. If you want them, load Natural Earth
  // GeoJSON files (or any other admin polygon source) at build time or
  // from a CDN and pass them in here.
  const regions = regionsForTiles(tiles, {});

  const payload = {
    ...fc,
    metadata: {
      generatedAt: new Date().toISOString(),
      tileCount: tiles.length,
      visitedPixelCount,
      bbox,
      ...regions,
    },
  };

  const body = JSON.stringify(payload);
  const blob = await put(BLOB_KEY, body, {
    access: "private",
    contentType: "application/geo+json",
    cacheControlMaxAge: 3600,
    allowOverwrite: true,
  });

  return Response.json({
    ok: true,
    url: blob.url,
    tileCount: tiles.length,
    visitedPixelCount,
  });
}
