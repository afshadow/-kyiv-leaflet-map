# Project Rasters

Put your project raster files in this directory and describe them in `manifest.json`.

Supported project raster layer types:

- `image` for PNG/JPG overlays with explicit bounds
- `geotiff` for GeoTIFF files that can be parsed directly

Example `manifest.json` entry:

```json
{
  "id": "city-overlay",
  "label": "City Overlay",
  "description": "Custom PNG overlay",
  "type": "image",
  "url": "./data/rasters/city-overlay.png",
  "bounds": [[50.40, 30.45], [50.49, 30.60]],
  "opacity": 0.6
}
```

For `image` overlays, bounds are required in southwest / northeast format.
