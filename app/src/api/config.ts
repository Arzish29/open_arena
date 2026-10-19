// Backend settings from .env (see .env.example).
// VITE_USE_MOCK defaults to on, so the arcade is fully playable without a backend.
export const API_BASE: string = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK !== 'false';
