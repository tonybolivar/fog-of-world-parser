import { inflate } from "pako";
import { filenameToTile } from "./filename";

export const TILE_WIDTH = 128;
export const BITMAP_WIDTH = 64;
const TILE_HEADER_LEN = TILE_WIDTH * TILE_WIDTH;
const TILE_HEADER_SIZE = TILE_HEADER_LEN * 2;
const BLOCK_BITMAP_SIZE = 512;
const BLOCK_SIZE = 515;
const QMARK = "?".charCodeAt(0);

export interface ParsedBlock {
  /** Block x-coordinate inside the tile, 0..127 */
  bx: number;
  /** Block y-coordinate inside the tile, 0..127 */
  by: number;
  /** 512-byte bitmap where each bit represents one 64x64 pixel grid cell */
  bitmap: Uint8Array;
  /** Two-character region code stored in the block's extra data */
  region: string;
}

export interface ParsedTile {
  filename: string;
  /** Tile x-coordinate on the 512x512 world grid */
  tileX: number;
  /** Tile y-coordinate on the 512x512 world grid */
  tileY: number;
  blocks: ParsedBlock[];
}

/**
 * Parse a single Fog of World tile file.
 *
 * Input bytes should be the raw on-disk bytes (zlib-compressed). The parser
 * inflates the stream with pako so it runs in browsers, Node, Deno, and
 * edge runtimes without pulling in node:zlib.
 */
export function parseTile(filename: string, raw: Uint8Array): ParsedTile {
  const { x: tileX, y: tileY } = filenameToTile(filename);
  const buf = inflate(raw);
  if (buf.byteLength < TILE_HEADER_SIZE) {
    throw new Error(
      `${filename}: inflated size ${buf.byteLength} < header ${TILE_HEADER_SIZE}`,
    );
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const blocks: ParsedBlock[] = [];
  for (let i = 0; i < TILE_HEADER_LEN; i++) {
    const blockIdx = view.getUint16(i * 2, true);
    if (blockIdx === 0) continue;
    const start = TILE_HEADER_SIZE + (blockIdx - 1) * BLOCK_SIZE;
    if (start + BLOCK_BITMAP_SIZE > buf.byteLength) {
      throw new Error(`${filename}: block idx ${blockIdx} past eof`);
    }
    const extra0 = buf[start + BLOCK_BITMAP_SIZE];
    const extra1 = buf[start + BLOCK_BITMAP_SIZE + 1];
    const regionChar0 = String.fromCharCode((extra0 >> 3) + QMARK);
    const regionChar1 = String.fromCharCode(
      (((extra0 & 0x7) << 2) | ((extra1 & 0xc0) >> 6)) + QMARK,
    );
    blocks.push({
      bx: i % TILE_WIDTH,
      by: Math.floor(i / TILE_WIDTH),
      bitmap: new Uint8Array(buf.buffer, buf.byteOffset + start, BLOCK_BITMAP_SIZE),
      region: regionChar0 + regionChar1,
    });
  }
  return { filename, tileX, tileY, blocks };
}
