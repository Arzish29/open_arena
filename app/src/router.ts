// Routes: "/" is the landing page, "/play/:slug" is a full-screen game page.
// Every route is a full page load, so a game page always boots with no camera or mic open.

export type Route = { name: 'home' } | { name: 'play'; slug: string } | { name: 'missing' };

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '/index.html') return { name: 'home' };
  const m = /^\/play\/([^/]+)\/?$/.exec(pathname);
  if (m) return { name: 'play', slug: decodeURIComponent(m[1]) };
  return { name: 'missing' };
}

export function playPath(slug: string): string {
  return `/play/${encodeURIComponent(slug)}`;
}

export function go(path: string): void {
  location.assign(path);
}
