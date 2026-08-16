import { z } from 'zod';

export const RestaurantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  countries: z.array(z.string().length(3)),
  regions: z.array(z.string()),
  entities: z.array(z.string()),
  lat: z.number().min(43.2).max(44.3),
  lng: z.number().min(-80.3).max(-78.6),
  address: z.string().nullable(),
  municipality: z.string(),
  neighbourhood: z.string().nullable(),
  website: z.string().nullable(),
  verified: z.boolean(),
  note: z.string().nullable(),
  source: z.enum(['osm', 'manual']),
});
export type Restaurant = z.infer<typeof RestaurantSchema>;

export const CuisineMapSchema = z.object({
  aliases: z.record(z.string(), z.string()),
  map: z.record(
    z.string(),
    z.object({
      countries: z.array(z.string().length(3)).optional(),
      regions: z.array(z.string()).optional(),
      entities: z.array(z.string()).optional(),
    }),
  ),
  drop: z.array(z.string()),
  regions: z.record(z.string(), z.object({ label: z.string() })),
});
export type CuisineMap = z.infer<typeof CuisineMapSchema>;

export const OverridesSchema = z.object({
  remove: z.array(z.object({ id: z.string(), reason: z.string() })),
  patch: z.record(z.string(), RestaurantSchema.partial().omit({ id: true })),
  add: z.array(RestaurantSchema),
});
export type Overrides = z.infer<typeof OverridesSchema>;

export const CountriesSchema = z.object({
  seats: z.array(
    z.object({
      iso3: z.string().length(3),
      numeric: z.string(),
      name: z.string(),
      aliases: z.array(z.string()),
      lat: z.number(),
      lng: z.number(),
      in110m: z.boolean(),
      nudge: z.string().nullable(),
    }),
  ),
  entities: z.array(
    z.object({
      code: z.string(),
      numeric: z.string().nullable(),
      name: z.string(),
      aliases: z.array(z.string()),
      lat: z.number(),
      lng: z.number(),
      in110m: z.boolean(),
      topojsonName: z.string().nullable(),
    }),
  ),
  inertFeatures: z.array(z.object({ id: z.string().nullable(), name: z.string() })),
});
export type Countries = z.infer<typeof CountriesSchema>;
