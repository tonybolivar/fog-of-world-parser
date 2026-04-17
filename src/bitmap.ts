import { BITMAP_WIDTH, type ParsedTile } from "./parseTile";

/** True if pixel (px, py) inside a block's 64x64 bitmap is set. */
export function isVisited(bitmap: Uint8Array, px: number, py: number): boolean {
  return (bitmap[Math.floor(px / 8) + py * 8] & (1 << (7 - (px & 7)))) !== 0;
}

/** Count of visited pixels across all blocks in the tile. */
export function countVisited(tile: ParsedTile): number {
  let n = 0;
  for (const blk of tile.blocks) {
    for (let y = 0; y < BITMAP_WIDTH; y++) {
      const row = blk.bitmap.subarray(y * 8, y * 8 + 8);
      for (let i = 0; i < 8; i++) {
        let b = row[i];
        while (b) {
          b &= b - 1;
          n++;
        }
      }
    }
  }
  return n;
}
