function formatCoordinate(value) {
  return Number(value).toFixed(5);
}

function parseCoordinatePair(value) {
  if (!value) {
    return null;
  }

  const [latText, lngText] = value.split(",");
  const lat = Number(latText);
  const lng = Number(lngText);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return L.latLng(lat, lng);
}

export function writeRouteToUrl(startPoint, endPoint, mode) {
  const url = new URL(window.location.href);

  if (startPoint) {
    url.searchParams.set(
      "start",
      `${formatCoordinate(startPoint.lat)},${formatCoordinate(startPoint.lng)}`
    );
  } else {
    url.searchParams.delete("start");
  }

  if (endPoint) {
    url.searchParams.set(
      "end",
      `${formatCoordinate(endPoint.lat)},${formatCoordinate(endPoint.lng)}`
    );
  } else {
    url.searchParams.delete("end");
  }

  if (mode) {
    url.searchParams.set("mode", mode);
  } else {
    url.searchParams.delete("mode");
  }

  window.history.replaceState({}, "", url);
}

export function readRouteFromUrl() {
  const url = new URL(window.location.href);

  return {
    startPoint: parseCoordinatePair(url.searchParams.get("start")),
    endPoint: parseCoordinatePair(url.searchParams.get("end")),
    mode: url.searchParams.get("mode"),
  };
}
