/**
 * Planar point-in-polygon (even-odd ray cast) for GeoJSON Polygon /
 * MultiPolygon. Winding-order agnostic — unlike d3-geo's geoContains, which
 * treats rings as spherical and silently tests the complement when a source
 * (e.g. Nominatim) winds them the other way.
 */

type Ring = [number, number][];

interface Geometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown;
}

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function inPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  // Even-odd across exterior + holes
  let count = 0;
  for (const ring of rings) if (inRing(lng, lat, ring)) count++;
  return count % 2 === 1;
}

export function pointInGeometry(geometry: Geometry, lng: number, lat: number): boolean {
  if (geometry.type === 'Polygon') return inPolygon(lng, lat, geometry.coordinates as Ring[]);
  return (geometry.coordinates as Ring[][]).some((polygon) => inPolygon(lng, lat, polygon));
}

export interface BboxFeature<G extends Geometry = Geometry> {
  geometry: G;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function withBbox<T extends { geometry: Geometry }>(feature: T): T & BboxFeature {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  const walk = (coords: unknown): void => {
    if (typeof (coords as number[])[0] === 'number') {
      const [lng, lat] = coords as [number, number];
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    } else for (const c of coords as unknown[]) walk(c);
  };
  walk(feature.geometry.coordinates);
  return { ...feature, minLat, maxLat, minLng, maxLng };
}

export function containsPoint(feature: BboxFeature, lng: number, lat: number): boolean {
  return (
    lat >= feature.minLat &&
    lat <= feature.maxLat &&
    lng >= feature.minLng &&
    lng <= feature.maxLng &&
    pointInGeometry(feature.geometry, lng, lat)
  );
}
