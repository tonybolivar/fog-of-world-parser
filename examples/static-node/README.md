# static-node

A one-file CLI that reads every tile in a folder and dumps a GeoJSON.

## Usage

From this directory:

```bash
npm install
npx tsx cli.ts "/path/to/Fog of World/Sync" travels.geojson
```

The output has a `fog` MultiPolygon covering the world minus your
explored regions, one `Polygon` per connected group of visited blocks,
and a `metadata` block with tile counts, a bbox, and a timestamp.

From there the GeoJSON goes wherever you want: a static `index.html`
with MapLibre (see the sibling example), a Mapbox Studio dataset, a
GitHub issue for laughs, a `jq` pipeline.
