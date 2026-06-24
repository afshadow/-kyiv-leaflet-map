export function createLeafletMap({
  center,
  defaultTileset,
  mapNodeId,
  tilesets,
  zoom,
}) {
  const map = L.map(mapNodeId, {
    zoomControl: false,
  }).setView(center, zoom);

  L.control
    .zoom({
      position: "bottomright",
    })
    .addTo(map);

  let activeTilesetKey = defaultTileset;
  let baseTileLayer = null;
  let routeLayer = null;
  let startMarker = null;
  let endMarker = null;

  function clearRouteLayer() {
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
  }

  function clearRouteMarkers() {
    if (startMarker) {
      map.removeLayer(startMarker);
      startMarker = null;
    }

    if (endMarker) {
      map.removeLayer(endMarker);
      endMarker = null;
    }
  }

  function createPointMarker(latLng, label, className) {
    return L.marker(latLng, {
      title: label,
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: `route-point-marker ${className}`,
        html: `<span>${label}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    });
  }

  function renderRouteMarkers(startPoint, endPoint) {
    clearRouteMarkers();

    if (startPoint) {
      startMarker = createPointMarker(startPoint, "S", "is-start").addTo(map);
    }

    if (endPoint) {
      endMarker = createPointMarker(endPoint, "D", "is-end").addTo(map);
    }
  }

  function fitToPoints(routePoints) {
    if (!routePoints || !routePoints.length) {
      return;
    }

    map.fitBounds(L.latLngBounds(routePoints), {
      padding: [32, 32],
    });
  }

  function renderRoute(routePoints) {
    clearRouteLayer();

    routeLayer = L.polyline(routePoints, {
      color: "#0f7a6c",
      weight: 5,
      opacity: 0.92,
    }).addTo(map);

    fitToPoints(routePoints);
    return routeLayer;
  }

  function setBaseTileset(tilesetKey) {
    const nextTileset = tilesets[tilesetKey] ? tilesetKey : defaultTileset;
    const tileset = tilesets[nextTileset];

    if (baseTileLayer) {
      map.removeLayer(baseTileLayer);
    }

    baseTileLayer = L.tileLayer(tileset.url, tileset.options).addTo(map);
    activeTilesetKey = nextTileset;
    return activeTilesetKey;
  }

  setBaseTileset(defaultTileset);

  return {
    clearRouteLayer,
    clearRouteMarkers,
    fitToPoints,
    getActiveTilesetKey() {
      return activeTilesetKey;
    },
    getBaseTileLayer() {
      return baseTileLayer;
    },
    map,
    renderRoute,
    renderRouteMarkers,
    setBaseTileset,
  };
}
