import { geoEqualEarth, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import atlasJson from 'world-atlas/countries-110m.json';
import { COUNTRIES, COVERAGE, lookup, scopeCoverage } from '../data/loader.ts';
import type { Scope } from '../types.ts';

/**
 * Renders the user's stamped world map to a 1200×630 PNG, entirely in the
 * browser — no server. Stamped countries in the accent, the rest muted.
 */
export async function downloadShareCard(passport: ReadonlySet<string>, scope: Scope): Promise<void> {
  const W = 1200;
  const H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2; // 2x for retina crispness
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  const css = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string): string =>
    css.getPropertyValue(name).trim() || fallback;
  const paper = token('--paper', '#eef1ee');
  const ink = token('--ink', '#1b241f');
  const inkFaint = token('--ink-faint', '#5b665f');
  const accent = token('--accent', '#2447c5');
  const muted = token('--muted', '#cfd5d0');
  const stamp = token('--stamp', '#b3542e');

  await document.fonts.ready;

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // ---- map ----
  const projection = geoEqualEarth();
  projection.fitExtent(
    [
      [60, 130],
      [W - 60, H - 90],
    ],
    { type: 'Sphere' },
  );
  const path = geoPath(projection, ctx);

  const atlas = atlasJson as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const world = feature(atlas, atlas.objects.countries);
  const stampedNumerics = new Set(
    [...passport]
      .map((code) => lookup.seats.get(code)?.numeric ?? lookup.entities.get(code)?.numeric)
      .filter(Boolean),
  );

  for (const f of world.features) {
    if (f.properties.name === 'Antarctica') continue;
    ctx.beginPath();
    path(f);
    ctx.fillStyle = f.id && stampedNumerics.has(String(f.id)) ? accent : muted;
    ctx.fill();
    ctx.strokeStyle = paper;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  // Point-rendered micro-states, stamped or not
  for (const seat of COUNTRIES.seats) {
    if (seat.in110m) continue;
    const p = projection([seat.lng, seat.lat]);
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
    ctx.fillStyle = passport.has(seat.iso3) ? accent : muted;
    ctx.fill();
  }
  // Warm stamp rings over everything stamped
  const ringAt = (lng: number, lat: number): void => {
    const p = projection([lng, lat]);
    if (!p) return;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 7, 0, Math.PI * 2);
    ctx.strokeStyle = stamp;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  };
  for (const code of passport) {
    const place = lookup.seats.get(code) ?? lookup.entities.get(code);
    if (place) ringAt(place.lng, place.lat);
  }

  // ---- text ----
  const cov = scopeCoverage(scope);
  const available = COVERAGE.totals[scope].covered;
  const stampedSeats = [...passport].filter(
    (code) => lookup.seats.has(code) && (cov.countries[code] ?? 0) > 0,
  ).length;

  ctx.fillStyle = ink;
  ctx.font = '700 44px Fraunces, Georgia, serif';
  ctx.fillText(`I've eaten ${stampedSeats} of Toronto's ${available} countries`, 60, 76);
  ctx.font = '400 21px "IBM Plex Mono", monospace';
  ctx.fillStyle = inkFaint;
  ctx.fillText(`${COVERAGE.seats - available} still missing from the city · tablefor6ix.ca`, 60, 108);

  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // ---- download ----
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tablefor6ix-passport.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, 'image/png');
}
