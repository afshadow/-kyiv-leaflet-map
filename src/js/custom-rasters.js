function resolveRasterUrl(url) {
  if (!url) {
    return url;
  }

  if (/^https?:\/\//.test(url) || url.startsWith("/")) {
    return url;
  }

  const staticPrefix = window.__APP_STATIC_PREFIX__ || "";

  if (url.startsWith("./")) {
    return `${staticPrefix}${url.slice(2)}`;
  }

  return `${staticPrefix}${url}`;
}

async function ensureGeoRasterSupport() {
  if (!window.parseGeoraster || !window.GeoRasterLayer) {
    throw new Error("GeoTIFF support is not available on this page.");
  }
}

function createImageOverlay(map, url, bounds, opacity = 0.6) {
  const layer = L.imageOverlay(resolveRasterUrl(url), bounds, {
    opacity,
    interactive: false,
  }).addTo(map);

  map.fitBounds(bounds, {
    padding: [24, 24],
  });

  return layer;
}

async function createGeoTiffOverlay(map, arrayBuffer, opacity = 0.7) {
  await ensureGeoRasterSupport();

  const georaster = await window.parseGeoraster(arrayBuffer);
  const layer = new window.GeoRasterLayer({
    georaster,
    opacity,
    resolution: 256,
  });

  layer.addTo(map);

  if (layer.getBounds) {
    map.fitBounds(layer.getBounds(), {
      padding: [24, 24],
    });
  }

  return layer;
}

export async function loadProjectRasterManifest(url) {
  const appPaths = window.__APP_PATHS__ || {};
  const manifestUrl =
    url || appPaths.rastersManifestUrl || "./data/rasters/manifest.json";
  const response = await fetch(manifestUrl);

  if (!response.ok) {
    return { layers: [] };
  }

  const manifest = await response.json();
  return {
    layers: Array.isArray(manifest.layers) ? manifest.layers : [],
  };
}

export async function createProjectRasterLayer(map, layerDefinition) {
  if (layerDefinition.type === "image") {
    if (!Array.isArray(layerDefinition.bounds) || layerDefinition.bounds.length !== 2) {
      throw new Error(`Raster layer "${layerDefinition.label}" is missing bounds.`);
    }

    return createImageOverlay(
      map,
      layerDefinition.url,
      layerDefinition.bounds,
      layerDefinition.opacity
    );
  }

  if (layerDefinition.type === "geotiff") {
    const response = await fetch(layerDefinition.url);

    if (!response.ok) {
      throw new Error(`Unable to load GeoTIFF layer "${layerDefinition.label}".`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return createGeoTiffOverlay(map, arrayBuffer, layerDefinition.opacity);
  }

  throw new Error(`Unsupported raster layer type: ${layerDefinition.type}`);
}

export async function createUploadedRasterLayer({
  map,
  file,
  bounds,
  opacity = 0.7,
}) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".tif") || lowerName.endsWith(".tiff")) {
    const arrayBuffer = await file.arrayBuffer();
    return createGeoTiffOverlay(map, arrayBuffer, opacity);
  }

  if (lowerName.endsWith(".png") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    if (!bounds) {
      throw new Error("PNG/JPG raster overlays require explicit bounds.");
    }

    const objectUrl = URL.createObjectURL(file);
    const layer = createImageOverlay(map, objectUrl, bounds, opacity);
    layer.__objectUrl = objectUrl;
    return layer;
  }

  throw new Error("Only GeoTIFF, PNG, and JPG raster files are supported.");
}

export function disposeRasterLayer(map, layer) {
  if (!layer) {
    return;
  }

  map.removeLayer(layer);

  if (layer.__objectUrl) {
    URL.revokeObjectURL(layer.__objectUrl);
  }
}
