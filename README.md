# fog-of-world-parser

A TypeScript parser for the tile files the [Fog of World](https://fogofworld.app/)
app writes to your Dropbox. Give it the raw bytes, get back GeoJSON you
can render on whatever map library you already use.

The whole library is about 500 lines and has no runtime requirements beyond
what's already in its dependencies (`pako`, `polygon-clipping`, two tiny
Turf helpers, `ts-md5`). Runs in Node, in a browser, on Vercel edge, on
Cloudflare Workers, in Deno.

## Screenshots

(Drop your own screenshots in `screenshots/` after cloning. Placeholders:
`continental.png`, `state-popup.png`, `city-zoom.png`.)

## Install

```bash
npm install fog-of-world-parser
```

## Minimal example

```ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseTile, tilesToGeoJson } from "fog-of-world-parser";

const dir = "/path/to/Fog of World/Sync";
const tiles = readdirSync(dir)
  .filter((name) => /^[a-z0-9]+$/.test(name))
  .map((name) => parseTile(name, readFileSync(`${dir}/${name}`)));

writeFileSync("travels.geojson", JSON.stringify(tilesToGeoJson(tiles)));
```

You end up with a `FeatureCollection` that has:

- one `fog` MultiPolygon covering the entire world with your explored
  regions cut out as holes (handy if you want a dark terra-incognita
  overlay)
- one `Polygon` per connected group of visited 600 m blocks, tagged
  with a `blocks` count property

## How the format works

A tile file covers a 128 by 128 grid of "blocks". Each block is a 64 by
64 bitmap where a bit set to 1 means you were physically near that 9 m
square of ground. The world itself is a 512 by 512 grid of tiles, so at
the finest scale the whole planet is roughly 2^22 pixels on a side.

Filenames encode the tile's position using two character masks plus an
MD5 prefix. The file contents are zlib-compressed. Each block has a
512-byte bitmap plus three trailing bytes holding a region code and a
popcount checksum.

All the format research was done by
[CaviarChen/fog-machine](https://github.com/CaviarChen/fog-machine).
This package is a TypeScript port of their read path plus a
polygonization layer I wrote on top.

## API

```ts
import {
  // filename <-> tile id
  filenameToTile,      // (name: string) => { id, x, y }
  tileToFilename,      // (id: number) => string

  // tile parser
  parseTile,           // (name: string, bytes: Uint8Array) => ParsedTile
  isVisited,           // (bitmap: Uint8Array, px, py) => boolean
  countVisited,        // (tile: ParsedTile) => number

  // projection
  globalPixelToLngLat, // (gx, gy) => [lng, lat]  (Web Mercator)
  blockToGlobalPixel,  // (tile, block, pixel) => global pixel coord

  // polygonize
  tilesToGeoJson,      // (tiles) => FeatureCollection
  geoJsonBbox,         // (fc) => [minX, minY, maxX, maxY] | null

  // country / state / city detection (optional)
  regionsForTiles,     // (tiles, { countries, states, cities, minBlocks? })
} from "fog-of-world-parser";
```

### Types

- `ParsedTile`: `tileX`, `tileY`, and `blocks: ParsedBlock[]`
- `ParsedBlock`: `bx`, `by`, a 512-byte `bitmap`, and a two-char
  `region` code lifted from the extra-data bytes
- `RegionStats`: returned by `regionsForTiles`; contains per-country
  and per-state arrays (name, block count, bbox), a `cities` list,
  and optional `visitedStates` / `visitedCountries` as GeoJSON
  features if you want to outline the matched admin polygons on a map

### Using `regionsForTiles`

I deliberately left admin polygon loading to the caller. No fetches
baked in, no URLs hardcoded. Pass in whatever GeoJSON you have:

```ts
import { readFileSync } from "node:fs";
import { regionsForTiles } from "fog-of-world-parser";

const countries = JSON.parse(readFileSync("ne_50m_admin_0_countries.geojson", "utf8"));
const states    = JSON.parse(readFileSync("ne_50m_admin_1_states_provinces.geojson", "utf8"));
const cities    = JSON.parse(readFileSync("ne_10m_populated_places_simple.geojson", "utf8"));

const stats = regionsForTiles(tiles, {
  countries,
  states,
  cities,
  minBlocks: 10,    // filters out flyover GPS pings
});
```

I test against Natural Earth's public-domain GeoJSON
([nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector)),
but any source with a `NAME` / `name` property works. You can override
the property names via `countryNameKeys` / `stateNameKeys`.

## Getting your tile files

1. Install the Fog of World app (iOS or macOS).
2. Settings -> Sync, turn Dropbox on (iCloud works too).
3. Let the app sync at least once.
4. The tiles land in a folder under your Dropbox. Default paths:
   - macOS: `~/Dropbox/Apps/Fog of World/Sync`
   - Windows: `C:\Users\<you>\Dropbox\Apps\Fog of World\Sync`
5. Everything in that folder is a tile file. Filenames look like
   `74bflowskjkd` (lowercase, no extension).

## Running the examples

Each folder under `examples/` is self-contained and pulls the parser
from the local repo via `file:../..`, so edits to `src/` show up
immediately.

### `examples/static-node` - CLI

```bash
cd examples/static-node
npm install
npx tsx cli.ts "/path/to/Fog of World/Sync" travels.geojson
```

Dumps a single GeoJSON file. Host it anywhere.

### `examples/vanilla-maplibre` - static HTML

```bash
cp examples/static-node/travels.geojson examples/vanilla-maplibre/
cd examples/vanilla-maplibre
python3 -m http.server 8080
```

Then open http://localhost:8080. No build step, no framework.

### `examples/next-vercel` - Next.js + Vercel scaffold

A skeleton that shows the cron-plus-Blob pattern. You fill in a
`lib/sources/source.ts` that returns your tile files (from Dropbox, a
local disk, S3, wherever) and wire it up. The README in that folder
has the deploy steps.

## Caveats

The file format is reverse-engineered. If the app ships a new format
revision this parser could break until someone updates it. Pin an exact
version in production and treat upgrades as deliberate work.

There's no official Fog of World API. The only input this package
understands is the file bytes the app writes to disk.

Because the data is block-level (600 m resolution), highways come out
as stair-stepped strips of blocks, not smooth lines. If you need a
smoother shape you'd want to postprocess with marching squares or a
buffer-and-simplify pass.

## License

MIT. See `LICENSE`.

## Credits

- [CaviarChen/fog-machine](https://github.com/CaviarChen/fog-machine)
  did the format reverse-engineering. This package would not exist
  without it.
- [Natural Earth](https://www.naturalearthdata.com/) for public-domain
  admin polygons that pair well with `regionsForTiles`.
