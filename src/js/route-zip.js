function serializePoint(point) {
  if (!point) {
    return null;
  }

  return {
    lat: Number(point.lat),
    lng: Number(point.lng),
  };
}

function deserializePoint(point) {
  if (!point) {
    return null;
  }

  return L.latLng(Number(point.lat), Number(point.lng));
}

export async function exportRouteZip({ startPoint, endPoint, mode, rasterEnabled, routeCells }) {
  const zip = new JSZip();
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    mode,
    rasterEnabled: Boolean(rasterEnabled),
    startPoint: serializePoint(startPoint),
    endPoint: serializePoint(endPoint),
    routeCells: Array.isArray(routeCells) ? routeCells.map((cell) => cell.label) : [],
  };

  zip.file("route.json", JSON.stringify(payload, null, 2));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeMode = mode || "route";

  link.href = url;
  link.download = `kyiv-route-${safeMode}.zip`;
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export async function importRouteZip(file) {
  const zip = await JSZip.loadAsync(file);
  const routeFile = zip.file("route.json");

  if (!routeFile) {
    throw new Error("ZIP file does not contain route.json.");
  }

  const rawText = await routeFile.async("string");
  const payload = JSON.parse(rawText);

  return {
    mode: payload.mode,
    rasterEnabled: Boolean(payload.rasterEnabled),
    startPoint: deserializePoint(payload.startPoint),
    endPoint: deserializePoint(payload.endPoint),
  };
}
