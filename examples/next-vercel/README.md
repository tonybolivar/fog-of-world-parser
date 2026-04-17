# next-vercel

A Next.js App Router scaffold for the cron-plus-Blob pattern: a daily
job reads your tile files, parses them, and writes GeoJSON to Vercel
Blob. A page reads the blob and renders a map.

This folder is a skeleton, not a full application. I kept it minimal so
you can read it end to end in one sitting and adapt it.

## Files

- `app/api/cron/travels/route.ts` - the cron handler. Reads tiles from
  `lib/sources/source.ts`, parses them, writes GeoJSON to Blob.
- `lib/sources/source.ts` - stub you fill in with your tile source.
  Dropbox, local disk, S3, whatever you've got.
- `vercel.json` - `0 7 * * *` cron schedule.

## Env vars

- `CRON_SECRET` - random string, protects the cron route.
- `BLOB_READ_WRITE_TOKEN` - injected automatically when you link a
  Vercel Blob store to the project.

## Trigger the first run after deploy

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.com/api/cron/travels
```

Vercel's cron runs on its schedule after that.

## Full example

My personal site has a complete version of this with country/state
detection, city labels, a snapshot-history slider, and photo pins:
https://github.com/tonybolivar/personal-website
