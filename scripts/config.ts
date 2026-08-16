/**
 * GTA municipalities included in the dataset. `relationId` is the OSM
 * admin-boundary relation, pinned so pulls are unambiguous and repeatable —
 * discover ids with `npm run data:pull -- --resolve` after editing this list.
 *
 * "Toronto" is the amalgamated city (includes Scarborough, North York,
 * Etobicoke); the site's Toronto-only scope filters on municipality === "Toronto".
 */
export interface Municipality {
  slug: string;
  name: string;
  relationId: number | null;
}

export const MUNICIPALITIES: Municipality[] = [
  { slug: 'toronto', name: 'Toronto', relationId: 324211 },
  { slug: 'mississauga', name: 'Mississauga', relationId: 1954127 },
  { slug: 'brampton', name: 'Brampton', relationId: 2407358 },
  { slug: 'markham', name: 'Markham', relationId: 324213 },
  { slug: 'richmond-hill', name: 'Richmond Hill', relationId: 2407259 },
  { slug: 'vaughan', name: 'Vaughan', relationId: 324212 },
  { slug: 'pickering', name: 'Pickering', relationId: 2408836 },
  { slug: 'ajax', name: 'Ajax', relationId: 2408837 },
  { slug: 'oakville', name: 'Oakville', relationId: 2407500 },
  { slug: 'aurora', name: 'Aurora', relationId: 2401094 },
  { slug: 'newmarket', name: 'Newmarket', relationId: 2407406 },
];
