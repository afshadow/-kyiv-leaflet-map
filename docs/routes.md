# Route Creation And Usage

This project now supports one route type only: a direct flight path.

## Route Creation

The route can be created in two ways:

1. Enter both places in the form and the route will build automatically.
2. Click once on the map to place the start point, then click again to place the destination.

## Route Lifecycle

1. `src/js/app.js` gathers user input and manages page state.
2. `src/js/search.js` geocodes text queries with Nominatim.
3. `src/components/Map/leaflet-map.js` renders a direct line between origin and destination.
4. The UI calculates distance and estimated flight time locally.

## URL State

The active route is stored in query parameters:

- `start=lat,lng`
- `end=lat,lng`
- `mode=plane`

Example:

```text
?start=50.45010,30.52340&end=50.43470,30.55700&mode=plane
```

When the app opens, those parameters are read and the flight route is restored automatically.

## Related Features

The route screen also supports:

- PNG route preview export
- ZIP route export
- raster tileset switching
- project raster overlays
- local GeoTIFF and image overlays
