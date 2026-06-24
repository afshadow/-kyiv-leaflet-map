function toAlphabetLabel(index) {
  let value = index + 1;
  let label = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function getCellIndex(point, origin, cellSize) {
  return {
    row: Math.floor((point.lat - origin.lat) / cellSize),
    column: Math.floor((point.lng - origin.lng) / cellSize),
  };
}

function getCellBounds(row, column, origin, cellSize) {
  const south = origin.lat + row * cellSize;
  const west = origin.lng + column * cellSize;

  return [
    [south, west],
    [south + cellSize, west + cellSize],
  ];
}

function getCellKey(row, column) {
  return `${row}:${column}`;
}

function getCellLabel(row, column) {
  return `${toAlphabetLabel(column)}-${row + 1}`;
}

function sampleSegment(startPoint, endPoint, steps) {
  const samples = [];

  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    samples.push(
      L.latLng(
        startPoint.lat + (endPoint.lat - startPoint.lat) * ratio,
        startPoint.lng + (endPoint.lng - startPoint.lng) * ratio
      )
    );
  }

  return samples;
}

function getAdaptiveCellSize(routePoints, baseCellSize, maxRouteCells) {
  if (!routePoints || routePoints.length < 2 || !maxRouteCells) {
    return baseCellSize;
  }

  let totalLatSpan = 0;
  let totalLngSpan = 0;

  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const startPoint = routePoints[index];
    const endPoint = routePoints[index + 1];

    totalLatSpan += Math.abs(endPoint.lat - startPoint.lat);
    totalLngSpan += Math.abs(endPoint.lng - startPoint.lng);
  }

  const requiredCellSize = (totalLatSpan + totalLngSpan) / Math.max(maxRouteCells - 1, 1);
  return Math.max(baseCellSize, requiredCellSize || baseCellSize);
}

function buildRouteCellKeys(routePoints, origin, cellSize) {
  const keys = new Set();

  if (!routePoints || routePoints.length === 0) {
    return keys;
  }

  if (routePoints.length === 1) {
    const cell = getCellIndex(routePoints[0], origin, cellSize);
    keys.add(getCellKey(cell.row, cell.column));
    return keys;
  }

  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const startPoint = routePoints[index];
    const endPoint = routePoints[index + 1];
    const deltaLat = endPoint.lat - startPoint.lat;
    const deltaLng = endPoint.lng - startPoint.lng;
    const span = Math.max(Math.abs(deltaLat), Math.abs(deltaLng));
    const steps = Math.max(2, Math.ceil(span / (cellSize / 3)));
    const samples = sampleSegment(startPoint, endPoint, steps);

    samples.forEach((point) => {
      const cell = getCellIndex(point, origin, cellSize);
      keys.add(getCellKey(cell.row, cell.column));
    });
  }

  return keys;
}

export function createGridOverlay({ map, cellSize, origin, maxRouteCells }) {
  let routeCellKeys = new Set();
  let routeCells = [];
  const routeCellLayer = map ? L.layerGroup().addTo(map) : null;

  function renderRouteCells() {
    if (!routeCellLayer) {
      return;
    }

    routeCellLayer.clearLayers();

    routeCells.forEach((cell) => {
      L.rectangle(cell.bounds, {
        color: "#c96a13",
        dashArray: "8 6",
        fillColor: "#f2bb74",
        fillOpacity: 0.1,
        interactive: false,
        opacity: 0.65,
        weight: 1,
      }).addTo(routeCellLayer);
    });

    if (typeof routeCellLayer.bringToBack === "function") {
      routeCellLayer.bringToBack();
    }
  }

  function setRoutePoints(routePoints) {
    const effectiveCellSize = getAdaptiveCellSize(routePoints, cellSize, maxRouteCells);
    routeCellKeys = buildRouteCellKeys(routePoints, origin, effectiveCellSize);
    routeCells = Array.from(routeCellKeys)
      .map((cellKey) => {
        const [rowText, columnText] = cellKey.split(":");
        const row = Number(rowText);
        const column = Number(columnText);

        return {
          key: cellKey,
          row,
          column,
          label: getCellLabel(row, column),
          bounds: getCellBounds(row, column, origin, effectiveCellSize),
          cellSize: effectiveCellSize,
        };
      })
      .sort((left, right) => {
        if (left.column !== right.column) {
          return left.column - right.column;
        }

        return left.row - right.row;
      });

    renderRouteCells();
  }

  return {
    clearRouteCells() {
      routeCellKeys = new Set();
      routeCells = [];
      if (routeCellLayer) {
        routeCellLayer.clearLayers();
      }
    },
    getRouteCells() {
      return routeCells.slice();
    },
    setRoutePoints,
  };
}
