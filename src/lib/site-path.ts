// Vite supplies '/' locally and '/FamilySplitter/' for the Pages build.
export function siteHref(
  path: string,
  base = import.meta.env.BASE_URL,
): string {
  return `${base}${path.replace(/^\//, '')}`;
}

export function appPath(path: string, base = import.meta.env.BASE_URL): string {
  if (base === '/') return path;
  if (path === base.slice(0, -1)) return '/';
  return path.startsWith(base) ? `/${path.slice(base.length)}` : '/unknown';
}
