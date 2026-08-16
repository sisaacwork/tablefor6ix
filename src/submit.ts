export const REPO_URL = 'https://github.com/sisaacwork/tablefor6ix';

/** Prefilled GitHub issue-form link for suggesting a restaurant. */
export function submissionUrl(countryName?: string): string {
  const params = new URLSearchParams({ template: 'add-restaurant.yml' });
  if (countryName) {
    params.set('title', `Add: [${countryName}]`);
    params.set('country', countryName);
  }
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
