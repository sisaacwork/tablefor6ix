import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Store } from '../state/store.ts';
import type { Restaurant } from '../types.ts';
import { restaurantsFor, restaurantFlags, cuisineLabel } from '../data/loader.ts';

const TORONTO_CENTER: L.LatLngExpression = [43.72, -79.4];

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function popupHtml(r: Restaurant): string {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const flags = restaurantFlags(r);
  const parts = [
    `<div class="popup-name">${flags ? `${flags} ` : ''}${esc(r.name)}</div>`,
    `<div class="popup-meta popup-cuisine">${esc(cuisineLabel(r))}</div>`,
  ];
  const meta = [r.address, r.neighbourhood, r.municipality !== 'Toronto' ? r.municipality : null]
    .filter(Boolean)
    .join(' · ');
  if (meta) parts.push(`<div class="popup-meta">${esc(meta)}</div>`);
  if (r.station) {
    const icon = r.station.kind === 'subway' ? '🚇' : '🚋';
    parts.push(`<div class="popup-meta">${icon} ${esc(r.station.name)} · ${r.station.m} m</div>`);
  }
  if (r.website) {
    let host = r.website;
    try {
      host = new URL(r.website).hostname.replace(/^www\./, '');
    } catch {
      /* keep raw */
    }
    parts.push(
      `<div class="popup-meta"><a href="${esc(r.website)}" target="_blank" rel="noopener">${esc(host)}</a></div>`,
    );
  }
  return parts.join('');
}

export function mountTorontoMap(container: HTMLElement, store: Store): void {
  const map = L.map(container, {
    preferCanvas: true,
    center: TORONTO_CENTER,
    zoom: 10,
    zoomControl: true,
    attributionControl: true,
  });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  }).addTo(map);

  const markerLayer = L.layerGroup().addTo(map);
  const markersById = new Map<string, L.CircleMarker>();
  let staggerTimers: number[] = [];
  let renderedKey = '';
  // Opening a popup while the camera is animating gets it auto-closed (which
  // would also clear the selection) — hold popup opens until the map settles.
  let settleUntil = 0;

  function clearMarkers(): void {
    staggerTimers.forEach((t) => clearTimeout(t));
    staggerTimers = [];
    markerLayer.clearLayers();
    markersById.clear();
  }

  // The canvas renderer can't resolve CSS variables — read the computed values.
  const rootStyle = getComputedStyle(document.documentElement);
  const accent = rootStyle.getPropertyValue('--accent').trim() || '#2447c5';
  const paperRaised = rootStyle.getPropertyValue('--paper-raised').trim() || '#f6f8f5';

  function makeMarker(r: Restaurant): L.CircleMarker {
    const marker = L.circleMarker([r.lat, r.lng], {
      radius: 6,
      color: accent,
      weight: 1.75,
      fillColor: paperRaised,
      fillOpacity: 0.9,
    });
    marker.bindPopup(() => popupHtml(r));
    marker.on('click', () => {
      const current = store.get().selectedRestaurant;
      if (current !== r.id) store.set({ selectedRestaurant: r.id });
    });
    marker.on('popupclose', () => {
      if (store.get().selectedRestaurant === r.id) store.set({ selectedRestaurant: null });
    });
    return marker;
  }

  // Renders are coalesced into a macrotask so they run after every store
  // listener in the same tick (including the one that flips the mobile screen)
  // — Leaflet maths go NaN on a display:none container. setTimeout rather than
  // requestAnimationFrame: rAF never fires in a hidden/background tab, which
  // would leave the map unrendered until the tab is focused.
  let scheduled = false;
  function render(): void {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      doRender();
    }, 0);
  }

  function doRender(): void {
    const state = store.get();
    if (container.offsetWidth === 0 || container.offsetHeight === 0) return; // hidden; re-rendered on screen swap
    map.invalidateSize();

    if ((!state.selection && !state.area) || !state.restaurants) {
      if (renderedKey !== '') {
        clearMarkers();
        renderedKey = '';
        map.setView(TORONTO_CENTER, 10, { animate: false });
      }
      return;
    }

    const key = [
      state.selection ? `${state.selection.kind}:${state.selection.code}` : '',
      state.area ?? '',
      state.scope,
    ].join('|');
    const list = restaurantsFor(state.restaurants, state.selection, state.scope, state.area);

    if (key !== renderedKey) {
      renderedKey = key;
      clearMarkers();
      if (list.length > 0) {
        const bounds = L.latLngBounds(list.map((r) => [r.lat, r.lng] as [number, number]));
        const boundsOpts = { padding: [36, 36] as [number, number], maxZoom: 15 };
        if (reducedMotion()) map.fitBounds(bounds, boundsOpts);
        else {
          map.flyToBounds(bounds, { ...boundsOpts, duration: 0.6 });
          settleUntil = Date.now() + 750;
        }

        // One orchestrated moment: markers stagger in over ~300ms.
        const stagger = reducedMotion() ? 0 : Math.min(300 / list.length, 24);
        list.forEach((r, i) => {
          const marker = makeMarker(r);
          markersById.set(r.id, marker);
          if (stagger === 0) marker.addTo(markerLayer);
          else {
            staggerTimers.push(
              window.setTimeout(() => marker.addTo(markerLayer), 150 + i * stagger),
            );
          }
        });
      }
    }

    // restaurant selection → open popup, once markers exist and the camera settled
    const selectedId = state.selectedRestaurant;
    if (selectedId) {
      const marker = markersById.get(selectedId);
      if (marker && !marker.isPopupOpen()) {
        const staggering = !markerLayer.hasLayer(marker);
        const wait = Math.max(settleUntil - Date.now(), staggering ? 480 : 0);
        if (wait === 0) marker.openPopup();
        else {
          staggerTimers.push(
            window.setTimeout(() => {
              if (store.get().selectedRestaurant === selectedId) marker.openPopup();
            }, wait),
          );
        }
      }
    }
  }

  render();
  store.subscribe((state, prev) => {
    if (
      state.selection !== prev.selection ||
      state.area !== prev.area ||
      state.scope !== prev.scope ||
      state.restaurants !== prev.restaurants ||
      state.selectedRestaurant !== prev.selectedRestaurant ||
      state.mobileScreen !== prev.mobileScreen ||
      state.view !== prev.view
    ) {
      render();
    }
  });
}
