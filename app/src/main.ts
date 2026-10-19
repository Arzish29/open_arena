import { findGame } from './games';
import { parseRoute } from './router';

const route = parseRoute(location.pathname);
const app = document.getElementById('app') as HTMLElement;

// Each route loads only its own code: the landing page never pulls in game or camera code.
if (route.name === 'home') {
  import('./landing/landing.js').then((m) => m.mount());
} else {
  const game = route.name === 'play' ? findGame(route.slug) : undefined;
  if (game) import('./play/page').then((m) => m.mount(app, game));
  else import('./play/notFound').then((m) => m.mount(app));
}
