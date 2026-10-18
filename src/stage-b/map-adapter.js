/**
 * Provider-neutral map seam. The only Leaflet-aware module in Stage B —
 * L is injected, so the rest of the app (and tests) never touch the
 * vendor library. Swapping tile providers or renderers means changing
 * this file and its config only.
 */

const SOURCE_STYLES = {
  manual_target_pin: { color: "#1d6fd1" },
  device_position: { color: "#148f4f" },
  refined_manual: { color: "#b06000" },
  sensor_observation: { color: "#6b4fc4" },
  external_reference: { color: "#555" },
  confirmed_destination: { color: "#c4333a" },
};

export function createLeafletAdapter({ L, elementId, center, zoom, tileUrl, attribution, onTileError }) {
  const map = L.map(elementId).setView(center, zoom);
  const tiles = L.tileLayer(tileUrl, { maxZoom: 19, attribution });
  let tileErrorReported = false;
  tiles.on("tileerror", () => {
    if (!tileErrorReported) {
      tileErrorReported = true;
      onTileError?.();
    }
  });
  tiles.addTo(map);

  let draftMarker = null;
  let editMarker = null;
  let destinationMarker = null;

  function pinIcon(source) {
    const { color } = SOURCE_STYLES[source] ?? SOURCE_STYLES.manual_target_pin;
    return L.divIcon({
      className: "h1geo-pin",
      html: `<span style="background:${color}"></span>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  return {
    onMapClick(handler) {
      map.on("click", (e) => handler({ latitude: e.latlng.lat, longitude: e.latlng.lng }));
    },

    showDraft({ latitude, longitude, source }) {
      this.clearDraft();
      draftMarker = L.marker([latitude, longitude], { icon: pinIcon(source) }).addTo(map);
      return draftMarker;
    },

    clearDraft() {
      if (draftMarker) {
        map.removeLayer(draftMarker);
        draftMarker = null;
      }
    },

    showSaved({ latitude, longitude, source, draggable, onDragEnd }) {
      this.clearSaved();
      editMarker = L.marker([latitude, longitude], { icon: pinIcon(source), draggable: Boolean(draggable) }).addTo(map);
      if (draggable && onDragEnd) {
        editMarker.on("dragend", () => {
          const p = editMarker.getLatLng();
          onDragEnd({ latitude: p.lat, longitude: p.lng });
        });
      }
      return editMarker;
    },

    clearSaved() {
      if (editMarker) {
        map.removeLayer(editMarker);
        editMarker = null;
      }
    },

    // The user-confirmed destination — visually distinct (red) from the
    // saved assertion pin (blue/green), independently draggable.
    showDestination({ latitude, longitude, draggable, onDragEnd }) {
      this.clearDestination();
      destinationMarker = L.marker([latitude, longitude], {
        icon: pinIcon("confirmed_destination"), draggable: Boolean(draggable),
      }).addTo(map);
      if (draggable && onDragEnd) {
        destinationMarker.on("dragend", () => {
          const p = destinationMarker.getLatLng();
          onDragEnd({ latitude: p.lat, longitude: p.lng });
        });
      }
      return destinationMarker;
    },

    clearDestination() {
      if (destinationMarker) {
        map.removeLayer(destinationMarker);
        destinationMarker = null;
      }
    },

    panTo(latitude, longitude) {
      map.setView([latitude, longitude], Math.max(map.getZoom(), 15));
    },

    accuracyCircle({ latitude, longitude, accuracyMeters }) {
      if (typeof accuracyMeters !== "number" || accuracyMeters <= 0) return null;
      const c = L.circle([latitude, longitude], { radius: accuracyMeters, color: "#148f4f", weight: 1 });
      c.addTo(map);
      return c;
    },
  };
}
