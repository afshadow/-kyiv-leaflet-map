import { createLeafletMap } from "../components/Map/leaflet-map.js";
import {
  DEFAULT_ROUTE_MODE,
  DEFAULT_TILESET,
  GRID_CELL_SIZE,
  GRID_ORIGIN,
  KYIV_CENTER,
  MAP_ZOOM,
  MAX_ROUTE_SQUARES,
  ROUTE_MODES,
  STATUS_TEXT,
  TILESETS,
} from "./config.js";
import { createGridOverlay } from "./grid-overlay.js";
import { createRouteManager } from "./route-manager.js";
import {
  createProjectRasterLayer,
  createUploadedRasterLayer,
  disposeRasterLayer,
  loadProjectRasterManifest,
} from "./custom-rasters.js";
import { downloadGoogleStaticRouteArchive } from "../services/routing/google-static-export.js";
import { downloadRasterTilesZip } from "./raster-download.js";
import { exportRouteZip } from "./route-zip.js";
import { readRouteFromUrl, writeRouteToUrl } from "./route-url.js";
import { searchPlace } from "./search.js";

const statusNode = document.querySelector("#status");
const routeForm = document.querySelector("#route-form");
const startInput = document.querySelector("#start-query");
const endInput = document.querySelector("#end-query");
const modeInput = document.querySelector("#route-mode");
const tilesetSelect = document.querySelector("#tileset-select");
const clearButton = document.querySelector("#clear-route");
const exportRouteImageButton = document.querySelector("#export-route-image");
const exportRouteZipButton = document.querySelector("#export-route-zip");
const routeImageCard = document.querySelector("#route-image-card");
const routeImagePreview = document.querySelector("#route-image-preview");
const routeImageDownload = document.querySelector("#route-image-download");
const rasterCatalogCount = document.querySelector("#raster-catalog-count");
const rasterCatalogList = document.querySelector("#raster-catalog-list");
const downloadRasterFilesButton = document.querySelector("#download-raster-files");
const projectRasterCount = document.querySelector("#project-raster-count");
const projectRasterList = document.querySelector("#project-raster-list");
const localRasterFileInput = document.querySelector("#local-raster-file");
const loadLocalRasterButton = document.querySelector("#load-local-raster");
const clearLocalRasterButton = document.querySelector("#clear-local-raster");
const rasterSouthInput = document.querySelector("#raster-south");
const rasterWestInput = document.querySelector("#raster-west");
const rasterNorthInput = document.querySelector("#raster-north");
const rasterEastInput = document.querySelector("#raster-east");
const swapButton = document.querySelector("#swap-points");
const searchButtons = document.querySelectorAll("[data-search]");
const mapNode = document.querySelector("#map");
const routeFromUrl = readRouteFromUrl();

const currentMode = DEFAULT_ROUTE_MODE;
let currentTileset = DEFAULT_TILESET;
let routeSnapshot = null;
let projectRasterManifest = [];
let activeProjectRasterLayers = new Map();
let activeLocalRasterLayer = null;
let lastDomSelection = null;
let currentRouteCells = [];
let autoBuildTimer = null;
let lastBuiltQueryKey = "";
let activeTextBuildRequestId = 0;

const leafletMap = createLeafletMap({
  center: KYIV_CENTER,
  defaultTileset: currentTileset,
  mapNodeId: "map",
  tilesets: TILESETS,
  zoom: MAP_ZOOM,
});
const map = leafletMap.map;
const routeGrid = createGridOverlay({
  map,
  cellSize: GRID_CELL_SIZE,
  origin: GRID_ORIGIN,
  maxRouteCells: MAX_ROUTE_SQUARES,
});
const routeManager = createRouteManager({
  map,
  startInput,
  endInput,
  setStatus,
});

function setStatus(message) {
  if (statusNode) {
    statusNode.textContent = message;
  }
}

function updateGoogleSquaresButton(routeCells = currentRouteCells) {
  if (!exportRouteImageButton) {
    return;
  }

  const squareCount = Array.isArray(routeCells) ? routeCells.length : 0;

  if (!squareCount) {
    exportRouteImageButton.textContent = "DOWNLOAD GOOGLE SQUARES";
    return;
  }

  exportRouteImageButton.textContent =
    squareCount === 1
      ? "DOWNLOAD 1 GOOGLE SQUARE"
      : `DOWNLOAD ${squareCount} GOOGLE SQUARES`;
}

function setGoogleSquaresButtonBusy(isBusy, routeCells = currentRouteCells) {
  if (!exportRouteImageButton) {
    return;
  }

  if (isBusy) {
    exportRouteImageButton.textContent = "BUILDING GOOGLE ZIP...";
    return;
  }

  updateGoogleSquaresButton(routeCells);
}

function formatFlightDuration(distanceKm, speedKmh) {
  const totalHours = distanceKm / Math.max(speedKmh, 1);
  const hours = Math.floor(totalHours);
  const minutes = Math.max(1, Math.round((totalHours - hours) * 60));

  if (!hours) {
    return `${minutes} min`;
  }

  if (!minutes || minutes === 60) {
    return `${hours + (minutes === 60 ? 1 : 0)} h`;
  }

  return `${hours} h ${minutes} min`;
}

function restoreMobileMapViewport() {
  if (window.innerWidth > 560) {
    return;
  }

  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  window.requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    map.invalidateSize(false);
  });
}

function syncRouteUrl() {
  const { startPoint, endPoint } = routeManager.getRoutePoints();
  writeRouteToUrl(startPoint, endPoint, startPoint || endPoint ? currentMode : null);
}

function getTextRouteQueryKey() {
  return `${startInput.value.trim()}\u0000${endInput.value.trim()}`;
}

function clearAutoBuildTimer() {
  if (autoBuildTimer) {
    window.clearTimeout(autoBuildTimer);
    autoBuildTimer = null;
  }
}

function cancelPendingTextBuilds() {
  clearAutoBuildTimer();
  activeTextBuildRequestId += 1;
}

function setBaseTileset(tilesetKey) {
  currentTileset = leafletMap.setBaseTileset(tilesetKey);
  tilesetSelect.value = currentTileset;
  renderRasterCatalog();
}

async function handleRasterDownload() {
  try {
    const result = await downloadRasterTilesZip({
      tileLayer: leafletMap.getBaseTileLayer(),
      tilesetKey: currentTileset,
      tilesetLabel: TILESETS[currentTileset].label,
      mapCenter: map.getCenter(),
      zoom: map.getZoom(),
    });

    setStatus(
      `Raster ZIP ready: ${result.savedTileCount} files saved${
        result.skippedTileCount ? `, ${result.skippedTileCount} skipped` : ""
      }.`
    );
  } catch (error) {
    setStatus(error.message || "Unable to download raster files.");
  }
}

function renderRasterCatalog() {
  const entries = Object.entries(TILESETS);
  rasterCatalogCount.textContent = String(entries.length);
  rasterCatalogList.innerHTML = entries
    .map(([key, tileset]) => {
      const activeClass = key === currentTileset ? " is-active" : "";
      return `
        <button type="button" class="raster-catalog-item${activeClass}" data-tileset-key="${key}">
          <strong>${tileset.label}</strong>
          <span>${tileset.description}</span>
        </button>
      `;
    })
    .join("");

  rasterCatalogList.querySelectorAll("[data-tileset-key]").forEach((button) => {
    button.addEventListener("click", () => {
      setBaseTileset(button.dataset.tilesetKey);
    });
  });
}

function parseRasterBoundsInputs() {
  const south = Number(rasterSouthInput.value);
  const west = Number(rasterWestInput.value);
  const north = Number(rasterNorthInput.value);
  const east = Number(rasterEastInput.value);

  if ([south, west, north, east].some((value) => !Number.isFinite(value))) {
    return null;
  }

  return [
    [south, west],
    [north, east],
  ];
}

function renderProjectRasterCatalog() {
  projectRasterCount.textContent = String(projectRasterManifest.length);

  if (!projectRasterManifest.length) {
    projectRasterList.innerHTML =
      '<p class="square-catalog-empty">No project rasters loaded yet.</p>';
    return;
  }

  projectRasterList.innerHTML = projectRasterManifest
    .map((layer) => {
      const activeClass = activeProjectRasterLayers.has(layer.id) ? " is-active" : "";
      const buttonLabel = activeProjectRasterLayers.has(layer.id) ? "Hide layer" : "Show layer";

      return `
        <div class="raster-catalog-item${activeClass}">
          <strong>${layer.label}</strong>
          <span>${layer.description || layer.type}</span>
          <button type="button" class="secondary-button" data-project-raster-id="${layer.id}">
            ${buttonLabel}
          </button>
        </div>
      `;
    })
    .join("");

  projectRasterList.querySelectorAll("[data-project-raster-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const layerId = button.dataset.projectRasterId;
      const layerDefinition = projectRasterManifest.find((item) => item.id === layerId);

      if (!layerDefinition) {
        return;
      }

      if (activeProjectRasterLayers.has(layerId)) {
        disposeRasterLayer(map, activeProjectRasterLayers.get(layerId));
        activeProjectRasterLayers.delete(layerId);
        renderProjectRasterCatalog();
        setStatus(`Project raster "${layerDefinition.label}" hidden.`);
        return;
      }

      try {
        const layer = await createProjectRasterLayer(map, layerDefinition);
        activeProjectRasterLayers.set(layerId, layer);
        renderProjectRasterCatalog();
        setStatus(`Project raster "${layerDefinition.label}" loaded.`);
      } catch (error) {
        setStatus(error.message || `Unable to load project raster "${layerDefinition.label}".`);
      }
    });
  });
}

async function loadProjectRasters() {
  const manifest = await loadProjectRasterManifest();
  projectRasterManifest = manifest.layers;
  renderProjectRasterCatalog();
}

async function handleLocalRasterLoad() {
  const [file] = localRasterFileInput.files;

  if (!file) {
    setStatus("Choose a local raster file first.");
    return;
  }

  const bounds = parseRasterBoundsInputs();

  try {
    if (activeLocalRasterLayer) {
      disposeRasterLayer(map, activeLocalRasterLayer);
      activeLocalRasterLayer = null;
    }

    activeLocalRasterLayer = await createUploadedRasterLayer({
      map,
      file,
      bounds,
      opacity: 0.72,
    });
    setStatus(`Local raster "${file.name}" loaded.`);
  } catch (error) {
    setStatus(error.message || "Unable to load local raster.");
  }
}

function clearLocalRaster() {
  if (activeLocalRasterLayer) {
    disposeRasterLayer(map, activeLocalRasterLayer);
    activeLocalRasterLayer = null;
  }

  localRasterFileInput.value = "";
  setStatus("Local raster cleared.");
}

function clearRouteImage() {
  routeSnapshot = null;
  exportRouteImageButton.disabled = true;
  updateGoogleSquaresButton([]);
  if (exportRouteZipButton) {
    exportRouteZipButton.disabled = true;
  }
  routeImageCard.hidden = true;
  routeImagePreview.removeAttribute("src");
  routeImageDownload.removeAttribute("href");
}

function updateRouteImage(snapshot) {
  routeSnapshot = snapshot;
  exportRouteImageButton.disabled = false;
  if (exportRouteZipButton) {
    exportRouteZipButton.disabled = false;
  }
}

function clearRouteRaster() {
  currentRouteCells = [];
  routeGrid.clearRouteCells();
  updateGoogleSquaresButton([]);
}

function updateRouteGrid(routePoints) {
  clearRouteRaster();

  if (!routePoints || !routePoints.length) {
    return [];
  }

  routeGrid.setRoutePoints(routePoints);
  currentRouteCells = routeGrid.getRouteCells();
  updateGoogleSquaresButton(currentRouteCells);
  return currentRouteCells.slice();
}

async function handleRouteZipExport() {
  const { startPoint, endPoint } = routeManager.getRoutePoints();

  if (!startPoint || !endPoint) {
    setStatus("SET ROUTE FIRST.");
    return;
  }

  try {
    await exportRouteZip({
      startPoint,
      endPoint,
      mode: currentMode,
      rasterEnabled: activeProjectRasterLayers.size > 0 || Boolean(activeLocalRasterLayer),
      routeCells: currentRouteCells,
    });
    setStatus("ZIP SAVED.");
  } catch (error) {
    setStatus("ZIP EXPORT FAILED.");
  }
}

async function handleGoogleRasterDownload() {
  const { startPoint, endPoint } = routeManager.getRoutePoints();

  if (!startPoint || !endPoint) {
    setStatus("SET ROUTE FIRST.");
    return;
  }

  const routeCells = currentRouteCells.length
    ? currentRouteCells.slice()
    : updateRouteGrid([startPoint, endPoint]);

  if (!routeCells.length) {
    setStatus("NO ROUTE SQUARES. REBUILD ROUTE.");
    return;
  }

  exportRouteImageButton.disabled = true;
  setGoogleSquaresButtonBusy(true, routeCells);
  setStatus(
    routeCells.length > 24
      ? `BUILDING GOOGLE ZIP... ${routeCells.length} SQUARES. WAIT.`
      : `DOWNLOADING GOOGLE SQUARES... ${routeCells.length} SQUARES.`
  );

  try {
    await downloadGoogleStaticRouteArchive({ startPoint, endPoint, routeCells });
    setStatus("GOOGLE SQUARES ZIP SAVED.");
  } catch (error) {
    const message = error.message || "GOOGLE SQUARES DOWNLOAD FAILED.";
    if (message.includes("This API is not activated on your API project")) {
      setStatus("GOOGLE STATIC API IS DISABLED IN GOOGLE CLOUD.");
      return;
    }
    setStatus(message);
  } finally {
    exportRouteImageButton.disabled = false;
    setGoogleSquaresButtonBusy(false, routeCells);
  }
}

async function buildRouteFromTextQueries({ force = false, statusMessage = STATUS_TEXT.loadingRoute } = {}) {
  const startQuery = startInput.value.trim();
  const endQuery = endInput.value.trim();

  if (!startQuery || !endQuery) {
    if (force) {
      setStatus(STATUS_TEXT.fillBothPoints);
    }
    return false;
  }

  const queryKey = getTextRouteQueryKey();
  if (!force && queryKey === lastBuiltQueryKey) {
    return false;
  }

  const requestId = ++activeTextBuildRequestId;
  setStatus(statusMessage);

  try {
    const [startLatLng, endLatLng] = await Promise.all([
      searchPlace(startQuery),
      searchPlace(endQuery),
    ]);

    if (requestId !== activeTextBuildRequestId) {
      return false;
    }

    routeManager.setRoute(startLatLng, endLatLng);
    lastBuiltQueryKey = queryKey;
    await refreshRouteDisplay();
    syncRouteUrl();
    return true;
  } catch (error) {
    if (requestId !== activeTextBuildRequestId) {
      return false;
    }

    setStatus(error.message);
    return false;
  }
}

function scheduleAutoBuildFromInputs() {
  clearAutoBuildTimer();

  const startQuery = startInput.value.trim();
  const endQuery = endInput.value.trim();

  if (!startQuery || !endQuery) {
    return;
  }

  autoBuildTimer = window.setTimeout(() => {
    autoBuildTimer = null;
    buildRouteFromTextQueries({
      statusMessage: "AUTO BUILDING ROUTE...",
    });
  }, 700);
}

async function renderPlaneRoute(message = STATUS_TEXT.planeRouteReady) {
  const { startPoint, endPoint } = routeManager.getRoutePoints();

  leafletMap.clearRouteLayer();
  leafletMap.renderRouteMarkers(startPoint, endPoint);

  if (!startPoint || !endPoint) {
    clearRouteImage();
    clearRouteRaster();
    return;
  }

  const routePoints = [startPoint, endPoint];
  const routeLayer = leafletMap.renderRoute(routePoints);

  routeLayer.setStyle({
    color: "#c96a13",
    dashArray: "14 10",
    opacity: 0.92,
    weight: 5,
  });

  const distanceKm = startPoint.distanceTo(endPoint) / 1000;
  const durationLabel = formatFlightDuration(distanceKm, ROUTE_MODES.plane.speedKmh);
  const routeCells = updateRouteGrid(routePoints);

  updateRouteImage({
    modeKey: "plane",
    modeLabel: "Plane Route",
    distanceLabel: `${distanceKm.toFixed(1)} km`,
    durationLabel,
    routePoints,
    startPoint,
    endPoint,
    lineColor: "#c96a13",
    lineDash: [22, 16],
  });

  setStatus(`${message} ${distanceKm.toFixed(1)} km. ${durationLabel}. ${routeCells.length} SQUARES.`);
}

async function refreshRouteDisplay(message = STATUS_TEXT.routeUpdated) {
  const { startPoint, endPoint } = routeManager.getRoutePoints();

  if (!startPoint && !endPoint) {
    leafletMap.clearRouteLayer();
    leafletMap.clearRouteMarkers();
    clearRouteImage();
    clearRouteRaster();
    return;
  }

  if (!startPoint || !endPoint) {
    leafletMap.clearRouteLayer();
    leafletMap.renderRouteMarkers(startPoint, endPoint);
    clearRouteImage();
    clearRouteRaster();
    return;
  }

  await renderPlaneRoute(message);
}

async function handleRoutePointSelection(event) {
  cancelPendingTextBuilds();
  routeManager.handleMapClick(event);

  try {
    await refreshRouteDisplay();
  } catch (error) {
    setStatus(error.message || STATUS_TEXT.routeError);
  }

  syncRouteUrl();
}

function isSafariBrowser() {
  const userAgent = navigator.userAgent;
  return /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS|Edg/i.test(userAgent);
}

function hasTouchSupport() {
  return Boolean(
    navigator.maxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
  );
}

function attachMapSelectionFallback() {
  if (!mapNode) {
    return;
  }

  const useTouchFallback = hasTouchSupport();
  const useSafariMouseFallback = isSafariBrowser() && !useTouchFallback;

  if (!useTouchFallback && !useSafariMouseFallback) {
    return;
  }

  function shouldIgnoreTarget(target) {
    return Boolean(
      target instanceof Element &&
        target.closest(
          ".leaflet-control, .leaflet-popup, .leaflet-tooltip, a, button, input, select, textarea, label"
        )
    );
  }

  function shouldIgnoreDuplicateSelection(clientX, clientY) {
    const nextSelection = {
      x: clientX,
      y: clientY,
      time: Date.now(),
    };

    if (!lastDomSelection) {
      lastDomSelection = nextSelection;
      return false;
    }

    const elapsed = nextSelection.time - lastDomSelection.time;
    const distance = Math.hypot(
      nextSelection.x - lastDomSelection.x,
      nextSelection.y - lastDomSelection.y
    );

    lastDomSelection = nextSelection;
    return elapsed < 250 && distance < 6;
  }

  function selectPointFromClientPosition(clientX, clientY) {
    if (shouldIgnoreDuplicateSelection(clientX, clientY)) {
      return;
    }

    const bounds = mapNode.getBoundingClientRect();
    const containerPoint = L.point(clientX - bounds.left, clientY - bounds.top);
    const latlng = map.containerPointToLatLng(containerPoint);
    handleRoutePointSelection({ latlng });
  }

  if (useTouchFallback) {
    let touchStartPoint = null;

    mapNode.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length !== 1 || shouldIgnoreTarget(event.target)) {
          touchStartPoint = null;
          return;
        }

        const touch = event.touches[0];
        touchStartPoint = {
          clientX: touch.clientX,
          clientY: touch.clientY,
          time: Date.now(),
        };
      },
      { capture: true, passive: true }
    );

    mapNode.addEventListener(
      "touchend",
      (event) => {
        if (!touchStartPoint || event.changedTouches.length !== 1 || shouldIgnoreTarget(event.target)) {
          touchStartPoint = null;
          return;
        }

        const touch = event.changedTouches[0];
        const movedDistance = Math.hypot(
          touch.clientX - touchStartPoint.clientX,
          touch.clientY - touchStartPoint.clientY
        );
        const elapsed = Date.now() - touchStartPoint.time;

        touchStartPoint = null;

        if (movedDistance > 12 || elapsed > 1000) {
          return;
        }

        event.preventDefault();
        selectPointFromClientPosition(touch.clientX, touch.clientY);
      },
      { capture: true, passive: false }
    );
  }

  if (useSafariMouseFallback) {
    ["pointerup", "mouseup", "click", "auxclick", "contextmenu"].forEach((eventName) => {
      mapNode.addEventListener(
        eventName,
        (event) => {
          if (shouldIgnoreTarget(event.target)) {
            return;
          }

          event.preventDefault();
          selectPointFromClientPosition(event.clientX, event.clientY);
        },
        true
      );
    });
  }
}

async function handleSearch(target) {
  cancelPendingTextBuilds();
  const field = target === "start" ? startInput : endInput;
  const query = field.value.trim();

  if (!query) {
    setStatus(STATUS_TEXT.enterPlace);
    field.focus();
    return;
  }

  setStatus(`SEARCHING ${query}...`);

  try {
    const latLng = await searchPlace(query);

    if (target === "start") {
      routeManager.setStart(
        latLng,
        routeManager.hasEndPoint() ? STATUS_TEXT.routeUpdated : STATUS_TEXT.startSelected
      );
      lastBuiltQueryKey = routeManager.hasEndPoint() ? getTextRouteQueryKey() : "";
      await refreshRouteDisplay();
      syncRouteUrl();
      return;
    }

    routeManager.setEnd(
      latLng,
      routeManager.hasStartPoint() ? STATUS_TEXT.routeUpdated : STATUS_TEXT.endSelected
    );
    lastBuiltQueryKey = routeManager.hasStartPoint() ? getTextRouteQueryKey() : "";
    await refreshRouteDisplay();
    syncRouteUrl();
  } catch (error) {
    setStatus(error.message);
  }
}

if (modeInput) {
  modeInput.value = currentMode;
}
tilesetSelect.value = currentTileset;
renderRasterCatalog();
loadProjectRasters().catch(() => {
  renderProjectRasterCatalog();
});

map.on("click", (event) => {
  handleRoutePointSelection(event);
});

map.on("contextmenu", (event) => {
  handleRoutePointSelection(event);
});

attachMapSelectionFallback();

routeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  cancelPendingTextBuilds();
  await buildRouteFromTextQueries({ force: true });
});

swapButton.addEventListener("click", async () => {
  cancelPendingTextBuilds();
  routeManager.swapPoints();

  try {
    await refreshRouteDisplay();
  } catch (error) {
    setStatus(error.message || STATUS_TEXT.routeError);
  }

  syncRouteUrl();
});

clearButton.addEventListener("click", async () => {
  cancelPendingTextBuilds();
  lastBuiltQueryKey = "";
  routeManager.clearRoute();
  try {
    await refreshRouteDisplay();
  } catch (error) {
    setStatus(error.message || STATUS_TEXT.routeError);
  }
  syncRouteUrl();
});

searchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    handleSearch(button.dataset.search);
  });
});

[startInput, endInput].forEach((input) => {
  input.addEventListener("input", () => {
    lastBuiltQueryKey = "";
    scheduleAutoBuildFromInputs();
  });

  input.addEventListener("change", () => {
    scheduleAutoBuildFromInputs();
  });
});

exportRouteImageButton.addEventListener("click", () => {
  handleGoogleRasterDownload();
});

if (exportRouteZipButton) {
  exportRouteZipButton.addEventListener("click", () => {
    handleRouteZipExport();
  });
}

tilesetSelect.addEventListener("change", () => {
  setBaseTileset(tilesetSelect.value);
});

downloadRasterFilesButton.addEventListener("click", () => {
  handleRasterDownload();
});

loadLocalRasterButton.addEventListener("click", () => {
  handleLocalRasterLoad();
});

clearLocalRasterButton.addEventListener("click", () => {
  clearLocalRaster();
});

if (routeFromUrl.startPoint && routeFromUrl.endPoint) {
  routeManager.setRoute(routeFromUrl.startPoint, routeFromUrl.endPoint);
} else if (routeFromUrl.startPoint) {
  routeManager.setStart(routeFromUrl.startPoint, STATUS_TEXT.startSelected);
} else if (routeFromUrl.endPoint) {
  routeManager.setEnd(routeFromUrl.endPoint, STATUS_TEXT.endSelected);
}

refreshRouteDisplay().catch((error) => {
  setStatus(error.message || STATUS_TEXT.routeError);
});
syncRouteUrl();
restoreMobileMapViewport();

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const userLatLng = L.latLng(position.coords.latitude, position.coords.longitude);
      map.setView(userLatLng, 13);

      if (!routeManager.hasStartPoint() && !routeManager.hasEndPoint()) {
        setStatus(STATUS_TEXT.geolocationHint);
      }
    },
    () => {
      if (!routeManager.hasStartPoint() && !routeManager.hasEndPoint()) {
        setStatus(STATUS_TEXT.ready);
      }
    },
    { enableHighAccuracy: true, timeout: 5000 }
  );
} else if (!routeManager.hasStartPoint() && !routeManager.hasEndPoint()) {
  setStatus(STATUS_TEXT.ready);
}
