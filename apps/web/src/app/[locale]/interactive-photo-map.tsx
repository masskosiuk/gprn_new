"use client";

import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { groupPhotoMapMarkers } from "../../lib/photo-map-groups";

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
  readonly onPhotoOpen: (src: string, alt: string) => void;
}

export function InteractivePhotoMap({
  activeLocationId,
  ariaLabel,
  locations,
  markers,
  onLocationSelect,
  onPhotoOpen,
}: InteractivePhotoMapProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const activeLocationRef = useRef(activeLocationId);
  const onLocationSelectRef = useRef(onLocationSelect);
  const onPhotoOpenRef = useRef(onPhotoOpen);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const locationsRef = useRef(locations);
  const openGroupRef = useRef<string | null>(null);
  const updatingMarkers = useRef(false);
  const [mapVersion, setMapVersion] = useState(0);
  const locationKey = locations
    .map(
      (location) => `${location.id}:${location.latitude}:${location.longitude}`,
    )
    .join("|");

  useEffect(() => {
    locationsRef.current = locations;
  }, [locations]);

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  useEffect(() => {
    onPhotoOpenRef.current = onPhotoOpen;
  }, [onPhotoOpen]);

  useEffect(() => {
    const previousLocation = activeLocationRef.current;
    activeLocationRef.current = activeLocationId;
    const map = mapRef.current;
    const container = containerRef.current;

    if (!map || !container) {
      return;
    }
    if (activeLocationId === "all" && previousLocation !== "all") {
      openGroupRef.current = null;
      map.closePopup();
    }

    container
      .querySelectorAll<HTMLElement>(".photo-map-marker")
      .forEach((element) => {
        element.classList.toggle(
          "is-active",
          element.dataset.locationId === activeLocationId,
        );
      });
    focusMap(map, locations, activeLocationId, true);
  }, [activeLocationId, locationKey, mapVersion]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let disposed = false;
    let map: LeafletMap | null = null;
    let resizeObserver: ResizeObserver | null = null;

    void import("leaflet").then((leaflet) => {
      if (disposed || !containerRef.current) {
        return;
      }

      const leafletMap = leaflet.map(container, {
        maxZoom: 18,
        minZoom: 2,
        scrollWheelZoom: true,
        worldCopyJump: true,
        zoomControl: true,
      });
      map = leafletMap;
      mapRef.current = leafletMap;
      leafletRef.current = leaflet;
      leafletMap.on("popupclose", () => {
        if (!updatingMarkers.current) openGroupRef.current = null;
      });
      resizeObserver = new ResizeObserver(() => {
        leafletMap.invalidateSize({ pan: false });
      });
      resizeObserver.observe(container);

      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        })
        .addTo(leafletMap);

      focusMap(
        leafletMap,
        locationsRef.current,
        activeLocationRef.current,
        false,
      );
      leafletMap.invalidateSize();
      setMapVersion((version) => version + 1);
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      mapRef.current = null;
      leafletRef.current = null;
      map?.remove();
    };
  }, []);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const leafletMap = mapRef.current;
    if (!leaflet || !leafletMap) return;
    const layer = leaflet.layerGroup().addTo(leafletMap);

    groupPhotoMapMarkers(markers).forEach((group) => {
      const photo = group[0]!;
      const groupKey = `${photo.latitude.toFixed(4)}:${photo.longitude.toFixed(4)}`;
      const markerRoot = document.createElement("span");
      markerRoot.className = "photo-map-marker__group";
      const markerContent = document.createElement("span");
      markerContent.className = "photo-map-marker__frame";
      markerRoot.append(markerContent);
      if (group.length > 1) {
        const count = document.createElement("span");
        count.className = "photo-map-marker__count";
        count.textContent = String(group.length);
        markerRoot.append(count);
      }

      const thumbnail = document.createElement("img");
      thumbnail.alt = "";
      thumbnail.decoding = "async";
      thumbnail.loading = "lazy";
      thumbnail.src = photo.imageUrl;
      markerContent.append(thumbnail);

      const icon = leaflet.divIcon({
        className: `photo-map-marker${activeLocationRef.current === photo.id ? " is-active" : ""}`,
        html: markerRoot,
        iconAnchor: [27, 27],
        iconSize: [54, 54],
        popupAnchor: [0, -31],
      });

      const marker = leaflet.marker([photo.latitude, photo.longitude], {
        alt: `${photo.title}, ${photo.label}${group.length > 1 ? ` (${group.length})` : ""}`,
        icon,
        keyboard: true,
        riseOnHover: true,
        title: `${photo.title}, ${photo.label}`,
      });

      const popup = document.createElement("article");
      popup.className = "photo-map-popup";

      const preview = document.createElement("img");
      preview.alt = photo.title;
      preview.className = "previewable-image";
      preview.role = "button";
      preview.src = photo.imageUrl;
      preview.tabIndex = 0;
      preview.addEventListener("click", (event) => {
        event.stopPropagation();
        onPhotoOpenRef.current(photo.imageUrl, photo.title);
      });
      preview.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onPhotoOpenRef.current(photo.imageUrl, photo.title);
      });
      if (group.length === 1) popup.append(preview);

      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = group.length > 1 ? photo.label : photo.title;
      const location = document.createElement("span");
      location.textContent = photo.label;
      copy.append(title, location);
      popup.append(copy);
      if (group.length > 1) {
        location.textContent = String(group.length);
        const gallery = document.createElement("div");
        gallery.className = "photo-map-popup-gallery";
        for (const work of group) {
          const button = document.createElement("button");
          button.type = "button";
          button.title = work.title;
          button.setAttribute("aria-label", work.title);
          const image = document.createElement("img");
          image.src = work.imageUrl;
          image.alt = "";
          image.loading = "lazy";
          button.append(image);
          button.addEventListener("click", () =>
            onPhotoOpenRef.current(work.imageUrl, work.title),
          );
          gallery.append(button);
        }
        popup.append(gallery);
      }

      marker.bindPopup(popup, {
        closeButton: true,
        maxWidth: 260,
        minWidth: 210,
        maxHeight: Math.max(140, Math.min(290, leafletMap.getSize().y - 90)),
        keepInView: true,
        autoPanPadding: [16, 16],
      });
      marker.on("click", () => {
        openGroupRef.current = groupKey;
        onLocationSelectRef.current(photo.id);
        leafletMap.flyTo(
          [photo.latitude, photo.longitude],
          Math.max(leafletMap.getZoom(), 10),
          {
            duration: 0.7,
          },
        );
      });
      marker.addTo(layer);
      if (openGroupRef.current === groupKey) marker.openPopup();

      const markerElement = marker.getElement();
      if (markerElement) {
        markerElement.dataset.locationId = photo.id;
        markerElement.dataset.photoId = photo.photoId;
      }
    });

    return () => {
      updatingMarkers.current = true;
      leafletMap.removeLayer(layer);
      updatingMarkers.current = false;
    };
  }, [markers, mapVersion]);

  return (
    <div
      aria-label={ariaLabel}
      className="map-board"
      ref={containerRef}
      role="region"
    />
  );
}

function focusMap(
  map: LeafletMap,
  locations: readonly PhotoMapLocation[],
  activeLocationId: string,
  animate: boolean,
): void {
  if (activeLocationId === "all") {
    if (locations.length === 0) {
      map.setView([28, 12], 2);
      return;
    }

    map.fitBounds(
      locations.map((location) => [location.latitude, location.longitude]),
      { animate, maxZoom: 3, padding: [34, 34] },
    );
    return;
  }

  const location = locations.find(
    (candidate) => candidate.id === activeLocationId,
  );
  if (location) {
    map.flyTo([location.latitude, location.longitude], 10, {
      animate,
      duration: 0.7,
    });
  }
}
