# vanilla-maplibre

One HTML file. No build step. Renders a travels GeoJSON on an OSM
basemap using MapLibre from a CDN.

## Usage

```bash
# run the CLI example first
cp ../static-node/travels.geojson ./

python3 -m http.server 8080
# open http://localhost:8080
```

Drop `index.html` and `travels.geojson` on any static host (GitHub
Pages, Netlify, S3, Cloudflare Pages) and you've got a public travel
map.
