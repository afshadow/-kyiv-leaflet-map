const CARD_WIDTH = 1400;
const CARD_HEIGHT = 900;

function normalizePoint(point, bounds, padding, drawableWidth, drawableHeight) {
  const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
  const lngRange = Math.max(bounds.maxLng - bounds.minLng, 0.0001);

  return {
    x: padding + ((point.lng - bounds.minLng) / lngRange) * drawableWidth,
    y: padding + (1 - (point.lat - bounds.minLat) / latRange) * drawableHeight,
  };
}

function getBounds(points) {
  return points.reduce(
    (accumulator, point) => ({
      minLat: Math.min(accumulator.minLat, point.lat),
      maxLat: Math.max(accumulator.maxLat, point.lat),
      minLng: Math.min(accumulator.minLng, point.lng),
      maxLng: Math.max(accumulator.maxLng, point.lng),
    }),
    {
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
      minLng: Number.POSITIVE_INFINITY,
      maxLng: Number.NEGATIVE_INFINITY,
    }
  );
}

function formatCoordinate(point) {
  return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

export function createRouteImage(routeSnapshot) {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const context = canvas.getContext("2d");
  const padding = 90;
  const headerHeight = 170;
  const footerHeight = 140;
  const drawableWidth = CARD_WIDTH - padding * 2;
  const drawableHeight = CARD_HEIGHT - padding * 2 - headerHeight - footerHeight;
  const plotTop = padding + headerHeight;

  context.fillStyle = "#f6efe4";
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const gradient = context.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, "rgba(201, 106, 19, 0.16)");
  gradient.addColorStop(1, "rgba(15, 122, 108, 0.16)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  roundedRect(context, 45, 45, CARD_WIDTH - 90, CARD_HEIGHT - 90, 34);
  context.fillStyle = "rgba(255, 252, 247, 0.92)";
  context.fill();

  context.fillStyle = "#0f7a6c";
  context.font = "700 24px Trebuchet MS, Segoe UI, sans-serif";
  context.fillText("Kyiv Route Map", padding, 110);

  context.fillStyle = "#1d2a33";
  context.font = "700 54px Trebuchet MS, Segoe UI, sans-serif";
  context.fillText(routeSnapshot.modeLabel, padding, 165);

  context.fillStyle = "#5f6f79";
  context.font = "400 26px Trebuchet MS, Segoe UI, sans-serif";
  context.fillText(
    `${routeSnapshot.distanceLabel} • ${routeSnapshot.durationLabel}`,
    padding,
    205
  );

  const bounds = getBounds(routeSnapshot.routePoints);
  const normalizedPoints = routeSnapshot.routePoints.map((point) =>
    normalizePoint(point, bounds, padding, drawableWidth, drawableHeight)
  );

  roundedRect(context, padding - 20, plotTop - 20, drawableWidth + 40, drawableHeight + 40, 28);
  context.fillStyle = "rgba(244, 248, 246, 0.95)";
  context.fill();

  context.strokeStyle = "rgba(29, 42, 51, 0.08)";
  context.lineWidth = 1;
  for (let index = 0; index <= 4; index += 1) {
    const y = plotTop + (drawableHeight / 4) * index;
    context.beginPath();
    context.moveTo(padding, y);
    context.lineTo(CARD_WIDTH - padding, y);
    context.stroke();
  }

  context.lineJoin = "round";
  context.lineCap = "round";
  context.strokeStyle = routeSnapshot.lineColor;
  context.lineWidth = 12;
  context.setLineDash(routeSnapshot.lineDash || []);
  context.beginPath();
  normalizedPoints.forEach((point, index) => {
    const x = point.x;
    const y = plotTop + point.y - padding;

    if (index === 0) {
      context.moveTo(x, y);
      return;
    }

    context.lineTo(x, y);
  });
  context.stroke();
  context.setLineDash([]);

  const startPoint = normalizedPoints[0];
  const endPoint = normalizedPoints[normalizedPoints.length - 1];
  const startY = plotTop + startPoint.y - padding;
  const endY = plotTop + endPoint.y - padding;

  context.fillStyle = "#0f7a6c";
  context.beginPath();
  context.arc(startPoint.x, startY, 14, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#c96a13";
  context.beginPath();
  context.arc(endPoint.x, endY, 14, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#1d2a33";
  context.font = "700 24px Trebuchet MS, Segoe UI, sans-serif";
  context.fillText("Start", padding, CARD_HEIGHT - 120);
  context.font = "400 22px Trebuchet MS, Segoe UI, sans-serif";
  context.fillStyle = "#5f6f79";
  context.fillText(formatCoordinate(routeSnapshot.startPoint), padding, CARD_HEIGHT - 88);

  context.fillStyle = "#1d2a33";
  context.font = "700 24px Trebuchet MS, Segoe UI, sans-serif";
  context.fillText("Destination", CARD_WIDTH / 2 + 30, CARD_HEIGHT - 120);
  context.font = "400 22px Trebuchet MS, Segoe UI, sans-serif";
  context.fillStyle = "#5f6f79";
  context.fillText(formatCoordinate(routeSnapshot.endPoint), CARD_WIDTH / 2 + 30, CARD_HEIGHT - 88);

  return canvas.toDataURL("image/png");
}
