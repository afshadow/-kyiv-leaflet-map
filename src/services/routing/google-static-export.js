function extractFilenameFromDisposition(contentDisposition) {
  if (!contentDisposition) {
    return "kyiv-route-google-squares.zip";
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (plainMatch) {
    return plainMatch[1];
  }

  return "kyiv-route-google-squares.zip";
}

async function extractErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await response.json();
    const message = payload.error || "Google map download failed.";

    if (message.includes("This API is not activated on your API project")) {
      return "GOOGLE STATIC API IS DISABLED IN GOOGLE CLOUD.";
    }

    return message;
  }

  const text = await response.text();
  return text || "Google map download failed.";
}

function serializePoint(point) {
  return {
    lat: Number(point.lat),
    lng: Number(point.lng),
  };
}

export async function downloadGoogleStaticRouteArchive({ startPoint, endPoint, routeCells }) {
  const exportUrl =
    window.__APP_PATHS__?.googleStaticRouteExportUrl || "/api/export/google-static-route/";
  const response = await fetch(exportUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startPoint: serializePoint(startPoint),
      endPoint: serializePoint(endPoint),
    }),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = downloadUrl;
  link.download = extractFilenameFromDisposition(response.headers.get("content-disposition"));
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 1000);
}

export { downloadGoogleStaticRouteArchive as downloadGoogleStaticRouteImage };
