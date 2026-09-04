"use client";

import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef, type ReactNode } from "react";

export interface PhotoMapLocation {
  readonly id: string;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface PhotoMapMarker extends PhotoMapLocation {
  readonly imageUrl: string;
  readonly photoId: string;
  readonly title: string;
}

interface InteractivePhotoMapProps {
  readonly activeLocationId: string;
  readonly ariaLabel: string;
  readonly locations: readonly PhotoMapLocation[];
  readonly markers: readonly PhotoMapMarker[];
  readonly onLocationSelect: (locationId: string) => void;
}

export function InteractivePhotoMap({
  activeLocationId,
  ariaLabel,
  locations,
  markers,
  onLocationSelect
}: InteractivePhotoMapProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const activeLocationRef = useRef(activeLocationId);
  const onLocationSelectRef = useRef(onLocationSelect);

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  useEffect(() => {
    activeLocationRef.current = activeLocationId;
    const map = mapRef.current;
    const container = containerRef.current;

    if (!map || !container) {
      return;
    }

    container.querySelectorAll<HTMLElement>(".photo-map-marker").forEach((element) => {
      element.classList.toggle("is-active", element.dataset.locationId === activeLocationId);
    });
    focusMap(map, locations, activeLocationId, true);
  }, [activeLocationId, locations]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let disposed = false;
    let map: LeafletMap | null = null;

    void import("leaflet").then((leaflet) => {
      if (disposed || !containerRef.current) {
        return;
      }

      const leafletMap = leaflet.map(container, {
        maxZoom: 18,
        minZoom: 2,
        scrollWheelZoom: true,
        worldCopyJump: true,
        zoomControl: true
      });
      map = leafletMap;
      mapRef.current = leafletMap;

      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19
        })
        .addTo(leafletMap);

      markers.forEach((photo) => {
        const markerContent = document.createElement("span");
        markerContent.className = "photo-map-marker__frame";

        const thumbnail = document.createElement("img");
        thumbnail.alt = "";
        thumbnail.decoding = "async";
        thumbnail.loading = "lazy";
        thumbnail.src = photo.imageUrl;
        markerContent.append(thumbnail);

        const icon = leaflet.divIcon({
          className: `photo-map-marker${activeLocationRef.current === photo.id ? " is-active" : ""}`,
          html: markerContent,
          iconAnchor: [27, 27],
          iconSize: [54, 54],
          popupAnchor: [0, -31]
        });

        const marker = leaflet.marker([photo.latitude, photo.longitude], {
          alt: `${photo.title}, ${photo.label}`,
          icon,
          keyboard: true,
          riseOnHover: true,
          title: `${photo.title}, ${photo.label}`
        });

        const popup = document.createElement("article");
        popup.className = "photo-map-popup";

        const preview = document.createElement("img");
        preview.alt = photo.title;
        preview.src = photo.imageUrl;
        popup.append(preview);

        const copy = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = photo.title;
        const location = document.createElement("span");
        location.textContent = photo.label;
        copy.append(title, location);
        popup.append(copy);

        marker.bindPopup(popup, { closeButton: true, maxWidth: 260, minWidth: 210 });
        marker.on("click", () => {
          onLocationSelectRef.current(photo.id);
          leafletMap.flyTo([photo.latitude, photo.longitude], Math.max(leafletMap.getZoom(), 10), {
            duration: 0.7
          });
        });
        marker.addTo(leafletMap);

        const markerElement = marker.getElement();
        if (markerElement) {
          markerElement.dataset.locationId = photo.id;
          markerElement.dataset.photoId = photo.photoId;
        }
      });

      focusMap(leafletMap, locations, activeLocationRef.current, false);
      window.requestAnimationFrame(() => {
        leafletMap.invalidateSize();
      });
    });

    return () => {
      disposed = true;
      mapRef.current = null;
      map?.remove();
    };
  }, [locations, markers]);

  return <div aria-label={ariaLabel} className="map-board" ref={containerRef} role="region" />;
}

function focusMap(
  map: LeafletMap,
  locations: readonly PhotoMapLocation[],
  activeLocationId: string,
  animate: boolean
): void {
  if (activeLocationId === "all") {
    if (locations.length === 0) {
      map.setView([28, 12], 2);
      return;
    }

    map.fitBounds(
      locations.map((location) => [location.latitude, location.longitude]),
      { animate, maxZoom: 3, padding: [34, 34] }
    );
    return;
  }

  const location = locations.find((candidate) => candidate.id === activeLocationId);
  if (location) {
    map.flyTo([location.latitude, location.longitude], 10, { animate, duration: 0.7 });
  }
}
