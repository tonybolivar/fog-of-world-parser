export const MAP_WIDTH = 512;
export const TILE_WIDTH = 128;
export const BITMAP_WIDTH = 64;
export const FULL = MAP_WIDTH * TILE_WIDTH * BITMAP_WIDTH;

/** Convert a global Fog of World pixel coord to [lng, lat] (Web Mercator). */
export function globalPixelToLngLat(gx: number, gy: number): [number, number] {
  const lng = (gx / FULL) * 360 - 180;
  const lat =
    (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * gy) / FULL)) * 180) /
    Math.PI;
  return [lng, lat];
}

/** Build a global pixel coord from (tile, block, pixel) triples. */
export function blockToGlobalPixel(
  tile: number,
  block: number,
  pixel: number,
): number {
  return (tile << 13) | (block << 6) | pixel;
}
