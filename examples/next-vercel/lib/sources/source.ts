/**
 * Replace this module with your tile source of choice.
 *
 * The cron route only needs `{ name: string, bytes: Uint8Array }` pairs.
 * Typical sources:
 *
 *   1. Dropbox App folder (where Fog of World syncs by default). Use
 *      the `dropbox` npm package with a refresh token. See the personal
 *      site repo for a full implementation.
 *
 *   2. Local disk (developer machine, or mounted volume on a server).
 *      Read the Sync directory with fs.readdir + readFile.
 *
 *   3. S3 / R2 / any object store you have already uploaded the tiles
 *      to. Iterate a prefix and download each object.
 */
export interface TileSourceFile {
  name: string;
  bytes: Uint8Array;
}

export async function fetchTileFiles(): Promise<TileSourceFile[]> {
  throw new Error(
    "Implement fetchTileFiles in lib/sources/source.ts. " +
      "See the comment at the top of the file for examples.",
  );
}
