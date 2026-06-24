import { STATUS_TEXT } from "./config.js";

export function createRouteManager({ map, startInput, endInput, setStatus }) {
  let startPoint = null;
  let endPoint = null;

  function isSamePoint(firstPoint, secondPoint, toleranceMeters = 12) {
    if (!firstPoint || !secondPoint) {
      return false;
    }

    return firstPoint.distanceTo(secondPoint) <= toleranceMeters;
  }

  function syncWaypoints(message) {
    if (message) {
      setStatus(message);
    }
  }

  function clearRoute() {
    startPoint = null;
    endPoint = null;
    syncWaypoints();
    if (startInput) {
      startInput.value = "";
    }
    if (endInput) {
      endInput.value = "";
    }
    setStatus(STATUS_TEXT.routeCleared);
  }

  function setStart(latLng, message = STATUS_TEXT.startSelected) {
    startPoint = latLng;
    syncWaypoints(message);
    map.setView(latLng, 14);
  }

  function setEnd(latLng, message = STATUS_TEXT.endSelected) {
    endPoint = latLng;
    syncWaypoints(message);
    map.setView(latLng, 14);
  }

  function setRoute(startLatLng, endLatLng, message = STATUS_TEXT.routeUpdated) {
    startPoint = startLatLng;
    endPoint = endLatLng;
    syncWaypoints(message);
  }

  function handleMapClick(event) {
    if (!startPoint) {
      startPoint = event.latlng;
      syncWaypoints();
      setStatus(STATUS_TEXT.startPlaced);
      return;
    }

    if (!endPoint) {
      if (isSamePoint(startPoint, event.latlng)) {
        setStatus("START ALREADY SET. CLICK ANOTHER SPOT FOR END.");
        return;
      }

      endPoint = event.latlng;
      syncWaypoints(STATUS_TEXT.routeUpdated);
      return;
    }

    if (isSamePoint(startPoint, event.latlng) || isSamePoint(endPoint, event.latlng)) {
      return;
    }

    startPoint = event.latlng;
    syncWaypoints(STATUS_TEXT.routeUpdated);
    setStatus(STATUS_TEXT.startReplaced);
  }

  function swapPoints() {
    const previousStart = startPoint;
    const previousEnd = endPoint;
    const startValue = startInput ? startInput.value : "";
    const endValue = endInput ? endInput.value : "";

    if (startInput) {
      startInput.value = endValue;
    }
    if (endInput) {
      endInput.value = startValue;
    }
    startPoint = previousEnd;
    endPoint = previousStart;
    syncWaypoints();
    setStatus(STATUS_TEXT.swapped);
  }

  function hasCompleteRoute() {
    return Boolean(startPoint && endPoint);
  }

  function hasStartPoint() {
    return Boolean(startPoint);
  }

  function hasEndPoint() {
    return Boolean(endPoint);
  }

  function getRoutePoints() {
    return {
      startPoint,
      endPoint,
    };
  }

  return {
    clearRoute,
    getRoutePoints,
    handleMapClick,
    hasCompleteRoute,
    hasEndPoint,
    hasStartPoint,
    setEnd,
    setRoute,
    setStart,
    swapPoints,
  };
}
