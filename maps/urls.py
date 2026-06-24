from django.urls import path

from . import views


urlpatterns = [
    path("", views.raster_map, name="raster-map"),
    path("google-maps/", views.google_maps, name="google-maps"),
    path(
        "api/export/google-static-route/",
        views.google_static_route_export,
        name="google-static-route-export",
    ),
]
