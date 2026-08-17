import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import type { Store } from '../state/store.ts';
import type { Restaurant } from '../types.ts';
import { restaurantsFor, restaurantFlags, cuisineLabel, primaryFlag } from '../data/loader.ts';

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

/** Flag emoji as the pin when resolved; a small accent dot for flagless (regions, Tibet). */
function pinIcon(r: Restaurant): L.DivIcon {
  const flag = primaryFlag(r);
  return L.divIcon({
    className: '',
    html: flag
      ? `<span class="flag-pin" role="img">${flag}</span>`
      : '<span class="flag-pin flag-pin-dot"></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -10],
  });
}

function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const n = cluster.getChildCount();
  const tier = n >= 100 ? 'lg' : n >= 25 ? 'md' : 'sm';
  return L.divIcon({
    className: '',
    html: `<span class="cluster-pin cluster-${tier}">${n}</span>`,
    iconSize: tier === 'lg' ? [44, 44] : tier === 'md' ? [38, 38] : [32, 32],
  });
}

export function mountTorontoMap(container: HTMLElement, store: Store): void {
  const map = L.map(container, {
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

  if (import.meta.env.DEV) (window as unknown as { __map?: L.Map }).__map = map;

  const clusterGroup = L.markerClusterGroup({
    // Chunky clusters when zoomed out; past zoom 15 almost everything resolves
    // to flag pins, with only same-building stacks left to spiderfy.
    maxClusterRadius: (zoom: number) => (zoom >= 16 ? 18 : 55),
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    chunkedLoading: true,
    animate: !reducedMotion(),
    iconCreateFunction: clusterIcon,
  }).addTo(map);

  const markersById = new Map<string, L.Marker>();
  let renderedKey = '';
  let popupTimer: number | null = null;
  // Opening a popup while the camera is animating gets it auto-closed (which
  // would also clear the selection) — hold popup opens until the map settles.
  let settleUntil = 0;

  function makeMarker(r: Restaurant): L.Marker {
    const marker = L.marker([r.lat, r.lng], {
      icon: pinIcon(r),
      title: r.name,
      keyboard: false, // 6,000 tab stops would be hostile; the list is the keyboard path
    });
    marker.bindPopup(() => popupHtml(r));
    marker.on('click', () => {
      if (store.get().selectedRestaurant !== r.id) store.set({ selectedRestaurant: r.id });
    });
    marker.on('popupclose', () => {
      if (store.get().selectedRestaurant === r.id) store.set({ selectedRestaurant: null });
    });
    return marker;
  }

  // Coalesced via setTimeout, not rAF: rAF never fires in a hidden/background
  // tab, which would leave the map unrendered until the tab is focused. Leaflet
  // maths also go NaN on a display:none container, hence the size guard.
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
    if (!state.restaurants) return;

    const filtered = !!state.selection || !!state.area;
    // Default view: every pin in scope, clustered.
    const list = filtered
      ? restaurantsFor(state.restaurants, state.selection, state.scope, state.area)
      : state.restaurants.filter((r) => state.scope === 'gta' || r.municipality === 'Toronto');

    const key = [
      state.selection ? `${state.selection.kind}:${state.selection.code}` : '*',
      state.area ?? '',
      state.scope,
    ].join('|');

    if (key !== renderedKey) {
      renderedKey = key;
      if (popupTimer) clearTimeout(popupTimer);
      clusterGroup.clearLayers();
      markersById.clear();
      const markers = list.map((r) => {
        const marker = makeMarker(r);
        markersById.set(r.id, marker);
        return marker;
      });
      clusterGroup.addLayers(markers);

      if (filtered && list.length > 0) {
        const bounds = L.latLngBounds(list.map((r) => [r.lat, r.lng] as [number, number]));
        const boundsOpts = { padding: [36, 36] as [number, number], maxZoom: 15 };
        if (reducedMotion()) map.fitBounds(bounds, boundsOpts);
        else {
          map.flyToBounds(bounds, { ...boundsOpts, duration: 0.6 });
          settleUntil = Date.now() + 750;
        }
      } else if (!filtered) {
        map.setView(TORONTO_CENTER, 10, { animate: false });
      }
    }

    // restaurant selection → reveal the marker (unclustering if needed) and open its popup
    const selectedId = state.selectedRestaurant;
    if (selectedId) {
      const marker = markersById.get(selectedId);
      if (marker && !marker.isPopupOpen()) {
        const wait = Math.max(settleUntil - Date.now(), 0);
        if (popupTimer) clearTimeout(popupTimer);
        popupTimer = window.setTimeout(() => {
          if (store.get().selectedRestaurant !== selectedId) return;
          clusterGroup.zoomToShowLayer(marker, () => {
            settleUntil = Date.now() + 400;
            window.setTimeout(() => {
              if (store.get().selectedRestaurant === selectedId) marker.openPopup();
            }, 400);
          });
        }, wait);
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
