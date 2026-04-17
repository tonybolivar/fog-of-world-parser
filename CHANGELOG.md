# Changelog

## 0.1.0 (unreleased)

Initial release.

- `parseTile` reads Fog of World tile files (zlib inflate via pako).
- `tilesToGeoJson` produces a FeatureCollection with a fog MultiPolygon
  plus one explored Polygon per connected component, via
  polygon-clipping.
- `globalPixelToLngLat` and friends for Web Mercator coordinate math.
- `regionsForTiles` for country, state, and city detection. No network
  calls; caller supplies admin polygon GeoJSON.
- Runtime-agnostic. Works in browsers, Node, Deno, Bun, edge runtimes.
- Fixture-based test asserting the 36,983 visited-pixel benchmark from
  the upstream fog-machine test suite.
