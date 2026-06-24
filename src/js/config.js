export const KYIV_CENTER = [50.4501, 30.5234];
export const MAP_ZOOM = 12;
export const DEFAULT_ROUTE_MODE = "plane";
export const DEFAULT_TILESET = "osm";
export const GRID_CELL_SIZE = 0.02;
export const GRID_ORIGIN = {
  lat: 50.34,
  lng: 30.36,
};
export const MAX_ROUTE_SQUARES = 64;

export const TILESETS = {
  osm: {
    label: "OpenStreetMap",
    description: "Standard street raster tiles for the main city view.",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  hot: {
    label: "Humanitarian",
    description: "Humanitarian raster style with stronger road and settlement emphasis.",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by Humanitarian OpenStreetMap Team',
    },
  },
  topo: {
    label: "Topo",
    description: "Topographic raster tiles with terrain-oriented styling.",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 17,
      attribution:
        'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    },
  },
  carto_light: {
    label: "Carto Light",
    description: "Clean light raster basemap for route and grid contrast.",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    options: {
      maxZoom: 20,
      subdomains: "abcd",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
};

export const ROUTE_MODES = {
  plane: {
    label: "Plane",
    speedKmh: 800,
  },
};

export const STATUS_TEXT = {
  ready: "STEP 1: CLICK MAP FOR START.",
  routeUpdated: "ROUTE READY.",
  routeCleared: "CLEARED. STEP 1: CLICK MAP FOR START.",
  startSelected: "START SET.",
  endSelected: "END SET.",
  startPlaced: "START SET. STEP 2: CLICK MAP FOR END.",
  startReplaced: "START MOVED.",
  loadingRoute: "BUILDING ROUTE...",
  calculatingRoute: "CALCULATING ROUTE...",
  routeError: "ROUTE FAILED. TRY OTHER POINTS.",
  enterPlace: "TYPE A PLACE NAME.",
  fillBothPoints: "SET START AND END FIRST.",
  swapped: "ROUTE REVERSED.",
  planeRouteReady: "ROUTE READY.",
  geolocationHint: "YOUR POSITION IS READY. USE IT AS START IF NEEDED.",
};
