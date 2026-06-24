# Kyiv Flight Route Map

Leaflet-based map focused on Kyiv with a single route type: a direct flight path between two selected points.

The app is intentionally simple:

- Leaflet renders the map
- OpenStreetMap provides the raster basemap
- the route is always a straight flight line
- estimated flight time is calculated locally

## Architecture

```text
.
├── assets/
│   └── styles/
├── data/
│   └── rasters/
├── docs/
│   └── routes.md
├── kyiv_map_project/
├── maps/
├── templates/
│   └── maps/
├── src/
│   ├── components/
│   │   └── Map/
│   ├── js/
│   └── utils/
├── google-maps.html
├── index.html
├── leaflet-map.html
├── manage.py
└── requirements.txt
```

Key files:

- `src/components/Map/leaflet-map.js`: Leaflet map setup and polyline rendering
- `src/js/app.js`: main UI flow, place search, flight path build, raster handling, export
- `src/js/config.js`: shared map defaults and flight route settings
- `src/js/route-image.js`: PNG route preview generation
- `src/js/search.js`: Nominatim-based search

## Route Flow

1. User selects start and destination by search or map clicks.
2. Text queries are geocoded with Nominatim.
3. The frontend draws a direct line between both points in Leaflet.
4. Distance and estimated flight time are calculated locally.

## Run

Create a virtual environment, install dependencies, then run Django:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

Then open:

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/google-maps/`

The second URL is kept as a legacy alias, but it now serves the same flight route page.

## Features

- OSM raster basemap rendered with Leaflet
- direct plane route between selected points
- URL persistence for start, destination, and mode
- route preview export to PNG
- route export to ZIP
- project raster layers from `data/rasters/manifest.json`
- local GeoTIFF, PNG, and JPG overlay upload
- raster tile catalog and visible tile download

## Services

- geocoding: OpenStreetMap Nominatim
- tiles: OpenStreetMap-compatible raster providers

Internet access is required for both.

## Validation

Quick check:

```bash
.venv/bin/python manage.py check
```
