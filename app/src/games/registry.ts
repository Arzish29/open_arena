import type { GameModule } from '../play/types';

// One lazy chunk per game. Keys are the slugs in games.ts; folder names can differ.
export const GAME_LOADERS: Record<string, () => Promise<GameModule>> = {};
