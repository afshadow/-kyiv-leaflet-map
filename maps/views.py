import io
import json
import math
import zipfile
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.templatetags.static import static
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods


STATIC_MAP_IMAGE_SIZE = 640
STATIC_MAP_IMAGE_SCALE = 2
STATIC_MAP_MIN_ZOOM = 1
STATIC_MAP_MAX_ZOOM = 21
GRID_CELL_SIZE = 0.02
GRID_ORIGIN = {"lat": 50.34, "lng": 30.36}
MAX_ROUTE_EXPORT_CELLS = 64


def apply_no_cache_headers(response):
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response


def render_hybrid_page(request, template_name):
    response = render(
        request,
        template_name,
        {
            "app_static_prefix": "/static/",
            "rasters_manifest_url": static("rasters/manifest.json"),
            "google_static_route_export_url": reverse("google-static-route-export"),
            "asset_version": "20260624-flight-route-map-11",
        },
    )
    return apply_no_cache_headers(response)


def raster_map(request):
    return render_hybrid_page(request, "maps/index.html")


def google_maps(request):
    return render_hybrid_page(request, "maps/google_maps.html")


def parse_coordinate(request, name):
    raw_value = request.GET.get(name, "").strip()

    if not raw_value:
        raise ValueError(f"Missing query parameter: {name}")

    value = float(raw_value)
    return value


def build_google_static_map_url(
    start_lat,
    start_lng,
    end_lat,
    end_lng,
    *,
    center=None,
    zoom=None,
    visible=None,
    include_start_marker=True,
    include_end_marker=True,
):
    query_params = [
        ("size", f"{STATIC_MAP_IMAGE_SIZE}x{STATIC_MAP_IMAGE_SIZE}"),
        ("scale", str(STATIC_MAP_IMAGE_SCALE)),
        ("format", "png32"),
        ("maptype", "hybrid"),
        (
            "path",
            f"color:0xc96a13ff|weight:5|{start_lat},{start_lng}|{end_lat},{end_lng}",
        ),
        ("key", settings.GOOGLE_STATIC_MAPS_API_KEY),
    ]

    if center is not None and zoom is not None:
        query_params.extend(
            [
                ("center", f"{center[0]},{center[1]}"),
                ("zoom", str(zoom)),
            ]
        )
    elif visible is not None:
        query_params.append(("visible", visible))

    if include_start_marker:
        query_params.append(("markers", f"size:mid|color:green|label:S|{start_lat},{start_lng}"))

    if include_end_marker:
        query_params.append(("markers", f"size:mid|color:red|label:E|{end_lat},{end_lng}"))

    encoded_query = urllib_parse.urlencode(query_params, doseq=True)
    return f"https://maps.googleapis.com/maps/api/staticmap?{encoded_query}"


def extract_error_message(response_body):
    try:
        payload = json.loads(response_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        text = response_body.decode("utf-8", errors="ignore").strip()
        return text or "Google Static Maps request failed."

    if isinstance(payload, dict):
        return payload.get("error_message") or payload.get("error") or "Google Static Maps request failed."

    return "Google Static Maps request failed."


class GoogleStaticMapError(Exception):
    def __init__(self, message, *, status_code):
        super().__init__(message)
        self.status_code = status_code


def point_is_inside_bounds(lat, lng, bounds):
    south, west, north, east = bounds
    return south <= lat <= north and west <= lng <= east


def mercator_x(lng):
    return (lng + 180.0) / 360.0


def mercator_y(lat):
    clamped_lat = max(min(lat, 85.05112878), -85.05112878)
    sine = math.sin(math.radians(clamped_lat))
    return 0.5 - math.log((1 + sine) / (1 - sine)) / (4 * math.pi)


def compute_square_zoom(bounds):
    south, west, north, east = bounds
    usable_size = STATIC_MAP_IMAGE_SIZE * STATIC_MAP_IMAGE_SCALE * 0.9
    lng_fraction = abs(mercator_x(east) - mercator_x(west))
    lat_fraction = abs(mercator_y(north) - mercator_y(south))

    if lng_fraction == 0:
        zoom_x = STATIC_MAP_MAX_ZOOM
    else:
        zoom_x = math.log2(usable_size / (256 * lng_fraction))

    if lat_fraction == 0:
        zoom_y = STATIC_MAP_MAX_ZOOM
    else:
        zoom_y = math.log2(usable_size / (256 * lat_fraction))

    return max(
        STATIC_MAP_MIN_ZOOM,
        min(STATIC_MAP_MAX_ZOOM, math.floor(min(zoom_x, zoom_y))),
    )


def build_cell_center(bounds):
    south, west, north, east = bounds
    return ((south + north) / 2, (west + east) / 2)


def get_cell_index(lat, lng, origin, cell_size):
    return {
        "row": math.floor((lat - origin["lat"]) / cell_size),
        "column": math.floor((lng - origin["lng"]) / cell_size),
    }


def get_cell_key(row, column):
    return f"{row}:{column}"


def get_cell_bounds(row, column, origin, cell_size):
    south = origin["lat"] + row * cell_size
    west = origin["lng"] + column * cell_size
    return (south, west, south + cell_size, west + cell_size)


def to_alphabet_label(index):
    value = index + 1
    label = ""

    while value > 0:
        remainder = (value - 1) % 26
        label = chr(65 + remainder) + label
        value = math.floor((value - 1) / 26)

    return label


def get_cell_label(row, column):
    return f"{to_alphabet_label(column)}-{row + 1}"


def get_adaptive_cell_size(start_lat, start_lng, end_lat, end_lng, base_cell_size, max_route_cells):
    total_lat_span = abs(end_lat - start_lat)
    total_lng_span = abs(end_lng - start_lng)
    required_cell_size = (total_lat_span + total_lng_span) / max(max_route_cells - 1, 1)
    return max(base_cell_size, required_cell_size or base_cell_size)


def build_route_cells_from_points(start_lat, start_lng, end_lat, end_lng):
    effective_cell_size = get_adaptive_cell_size(
        start_lat,
        start_lng,
        end_lat,
        end_lng,
        GRID_CELL_SIZE,
        MAX_ROUTE_EXPORT_CELLS,
    )
    span = max(abs(end_lat - start_lat), abs(end_lng - start_lng))
    steps = max(2, math.ceil(span / (effective_cell_size / 3)))
    keys = set()

    for index in range(steps + 1):
        ratio = index / steps
        lat = start_lat + (end_lat - start_lat) * ratio
        lng = start_lng + (end_lng - start_lng) * ratio
        cell = get_cell_index(lat, lng, GRID_ORIGIN, effective_cell_size)
        keys.add(get_cell_key(cell["row"], cell["column"]))

    route_cells = []

    for cell_key in sorted(
        keys,
        key=lambda value: (int(value.split(":")[1]), int(value.split(":")[0])),
    ):
        row_text, column_text = cell_key.split(":")
        row = int(row_text)
        column = int(column_text)
        south, west, north, east = get_cell_bounds(row, column, GRID_ORIGIN, effective_cell_size)
        route_cells.append(
            {
                "label": get_cell_label(row, column),
                "bounds": (south, west, north, east),
            }
        )

    return route_cells


def fetch_google_static_map(static_map_url):
    outbound_request = urllib_request.Request(
        static_map_url,
        headers={"User-Agent": "KyivLeafletMap/1.0"},
    )

    try:
        with urllib_request.urlopen(outbound_request, timeout=20) as response:
            return response.read(), response.headers.get("Content-Type", "image/png")
    except urllib_error.HTTPError as error:
        raise GoogleStaticMapError(
            extract_error_message(error.read()),
            status_code=error.code,
        ) from error
    except urllib_error.URLError:
        raise GoogleStaticMapError(
            "Unable to reach Google Static Maps right now.",
            status_code=502,
        ) from None


def parse_json_request_body(request):
    if not request.body:
        return {}

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("Invalid JSON body.") from error

    if not isinstance(payload, dict):
        raise ValueError("JSON body must be an object.")

    return payload


def parse_point_payload(payload, key):
    point = payload.get(key)

    if not isinstance(point, dict):
        raise ValueError(f"Missing point payload: {key}")

    try:
        return float(point["lat"]), float(point["lng"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f"Invalid point payload: {key}") from error


def sanitize_cell_label(label, index):
    raw_label = str(label or f"cell-{index + 1}").strip().upper()
    safe_label = "".join(
        character if character.isalnum() or character in {"-", "_"} else "-"
        for character in raw_label
    ).strip("-_")
    return safe_label or f"CELL-{index + 1}"


def parse_route_cells(payload):
    raw_cells = payload.get("routeCells")

    if raw_cells is None:
        return []

    if not isinstance(raw_cells, list):
        raise ValueError("routeCells must be an array.")

    if len(raw_cells) > MAX_ROUTE_EXPORT_CELLS:
        raise ValueError("Too many route squares requested.")

    cells = []

    for index, raw_cell in enumerate(raw_cells):
        if not isinstance(raw_cell, dict):
            raise ValueError(f"Invalid route square at position {index + 1}.")

        raw_bounds = raw_cell.get("bounds")

        if not isinstance(raw_bounds, list) or len(raw_bounds) != 2:
            raise ValueError(f"Invalid bounds for route square {index + 1}.")

        south_west, north_east = raw_bounds

        try:
            south = float(south_west[0])
            west = float(south_west[1])
            north = float(north_east[0])
            east = float(north_east[1])
        except (TypeError, ValueError, IndexError) as error:
            raise ValueError(f"Invalid coordinate values for route square {index + 1}.") from error

        if north <= south or east <= west:
            raise ValueError(f"Invalid geographic bounds for route square {index + 1}.")

        cells.append(
            {
                "label": sanitize_cell_label(raw_cell.get("label"), index),
                "bounds": (south, west, north, east),
            }
        )

    return cells


def build_google_route_cells_archive(start_lat, start_lng, end_lat, end_lng, route_cells):
    archive_buffer = io.BytesIO()
    manifest = {
        "version": 1,
        "format": "google-static-route-squares",
        "mapType": "hybrid",
        "imageSize": {
            "width": STATIC_MAP_IMAGE_SIZE * STATIC_MAP_IMAGE_SCALE,
            "height": STATIC_MAP_IMAGE_SIZE * STATIC_MAP_IMAGE_SCALE,
        },
        "startPoint": {"lat": start_lat, "lng": start_lng},
        "endPoint": {"lat": end_lat, "lng": end_lng},
        "cells": [],
    }

    with zipfile.ZipFile(archive_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index, cell in enumerate(route_cells, start=1):
            bounds = cell["bounds"]
            center = build_cell_center(bounds)
            zoom = compute_square_zoom(bounds)
            static_map_url = build_google_static_map_url(
                start_lat,
                start_lng,
                end_lat,
                end_lng,
                center=center,
                zoom=zoom,
                include_start_marker=point_is_inside_bounds(start_lat, start_lng, bounds),
                include_end_marker=point_is_inside_bounds(end_lat, end_lng, bounds),
            )
            image_bytes, _content_type = fetch_google_static_map(static_map_url)
            filename = f"{index:02d}_{cell['label']}.png"
            archive.writestr(filename, image_bytes)
            manifest["cells"].append(
                {
                    "label": cell["label"],
                    "filename": filename,
                    "bounds": {
                        "south": bounds[0],
                        "west": bounds[1],
                        "north": bounds[2],
                        "east": bounds[3],
                    },
                    "center": {"lat": center[0], "lng": center[1]},
                    "zoom": zoom,
                }
            )

        archive.writestr("route-squares.json", json.dumps(manifest, indent=2))

    archive_buffer.seek(0)
    download_response = HttpResponse(archive_buffer.getvalue(), content_type="application/zip")
    download_response["Content-Disposition"] = (
        'attachment; filename="kyiv-route-google-squares.zip"'
    )
    return apply_no_cache_headers(download_response)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def google_static_route_export(request):
    if not settings.GOOGLE_STATIC_MAPS_API_KEY:
        return JsonResponse(
            {"error": "Google Static Maps API key is not configured on the server."},
            status=503,
        )

    try:
        if request.method == "POST":
            payload = parse_json_request_body(request)
            start_lat, start_lng = parse_point_payload(payload, "startPoint")
            end_lat, end_lng = parse_point_payload(payload, "endPoint")
            route_cells = build_route_cells_from_points(start_lat, start_lng, end_lat, end_lng)
        else:
            payload = None
            route_cells = []
            start_lat = parse_coordinate(request, "start_lat")
            start_lng = parse_coordinate(request, "start_lng")
            end_lat = parse_coordinate(request, "end_lat")
            end_lng = parse_coordinate(request, "end_lng")
    except ValueError as error:
        return JsonResponse({"error": str(error)}, status=400)

    if route_cells:
        try:
            return build_google_route_cells_archive(
                start_lat,
                start_lng,
                end_lat,
                end_lng,
                route_cells,
            )
        except GoogleStaticMapError as error:
            return JsonResponse({"error": str(error)}, status=error.status_code)

    static_map_url = build_google_static_map_url(
        start_lat,
        start_lng,
        end_lat,
        end_lng,
        visible=f"{start_lat},{start_lng}|{end_lat},{end_lng}",
    )

    try:
        image_bytes, content_type = fetch_google_static_map(static_map_url)
    except GoogleStaticMapError as error:
        return JsonResponse({"error": str(error)}, status=error.status_code)

    download_response = HttpResponse(image_bytes, content_type=content_type)
    download_response["Content-Disposition"] = 'attachment; filename="kyiv-route-google-hybrid.png"'
    return apply_no_cache_headers(download_response)
