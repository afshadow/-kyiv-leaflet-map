function getTileEntries(tileLayer) {
  if (!tileLayer || !tileLayer._tiles) {
    return [];
  }

  return Object.values(tileLayer._tiles)
    .filter((tile) => tile && tile.el && tile.coords)
    .map((tile) => ({
      src: tile.el.currentSrc || tile.el.src,
      coords: tile.coords,
    }))
    .filter((tile) => Boolean(tile.src));
}

function getFileExtension(contentType, fallbackUrl) {
  if (contentType && contentType.includes("png")) {
    return "png";
  }

  if (contentType && (contentType.includes("jpeg") || contentType.includes("jpg"))) {
    return "jpg";
  }

  const cleanUrl = fallbackUrl.split("?")[0];
  const extension = cleanUrl.split(".").pop();
  return extension && extension.length <= 4 ? extension : "png";
}

export async function downloadRasterTilesZip({
  tileLayer,
  tilesetKey,
  tilesetLabel,
  mapCenter,
  zoom,
}) {
  const tileEntries = getTileEntries(tileLayer);

  if (!tileEntries.length) {
    throw new Error("No raster tiles are loaded yet. Move or zoom the map and try again.");
  }

  const zip = new JSZip();
  const tilesFolder = zip.folder("tiles");
  const savedTiles = [];
  let skippedCount = 0;

  await Promise.all(
    tileEntries.map(async (tileEntry) => {
      try {
        const response = await fetch(tileEntry.src);

        if (!response.ok) {
          throw new Error("Tile request failed.");
        }

        const blob = await response.blob();
        const extension = getFileExtension(response.headers.get("content-type"), tileEntry.src);
        const filename = `${tileEntry.coords.z}_${tileEntry.coords.x}_${tileEntry.coords.y}.${extension}`;

        tilesFolder.file(filename, blob);
        savedTiles.push({
          filename,
          url: tileEntry.src,
          x: tileEntry.coords.x,
          y: tileEntry.coords.y,
          z: tileEntry.coords.z,
        });
      } catch (error) {
        skippedCount += 1;
      }
    })
  );

  if (!savedTiles.length) {
    throw new Error("Unable to download raster tiles from the current layer.");
  }

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        tilesetKey,
        tilesetLabel,
        zoom,
        mapCenter,
        savedTileCount: savedTiles.length,
        skippedTileCount: skippedCount,
        tiles: savedTiles,
      },
      null,
      2
    )
  );

  const archiveBlob = await zip.generateAsync({ type: "blob" });
  const archiveUrl = URL.createObjectURL(archiveBlob);
  const link = document.createElement("a");

  link.href = archiveUrl;
  link.download = `kyiv-rasters-${tilesetKey}-z${zoom}.zip`;
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(archiveUrl);
  }, 1000);

  return {
    savedTileCount: savedTiles.length,
    skippedTileCount: skippedCount,
  };
}
