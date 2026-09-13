const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const NUMERIC_ID_PATTERN = /\/\d+(?=\/|$)/g;

export function normalizeRoute(url: string): string {
  const path = url.split('?')[0] ?? url;

  return path
    .replace(UUID_PATTERN, ':id')
    .replace(NUMERIC_ID_PATTERN, '/:id')
    .replace(/\/+/g, '/');
}
