export async function searchPlace(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", `${query}, Kyiv, Ukraine`);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Search request failed.");
  }

  const places = await response.json();

  if (!places.length) {
    throw new Error("Location not found.");
  }

  return L.latLng(Number(places[0].lat), Number(places[0].lon));
}
