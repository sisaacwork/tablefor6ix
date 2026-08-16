import type { AppState } from '../types.ts';

export type Listener = (state: AppState, prev: AppState) => void;

export interface Store {
  get(): AppState;
  set(partial: Partial<AppState>): void;
  subscribe(fn: Listener): () => void;
}

export function createStore(initial: AppState): Store {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(partial) {
      const prev = state;
      state = { ...state, ...partial };
      for (const fn of listeners) {
        try {
          fn(state, prev);
        } catch (err) {
          console.error('store listener failed', err);
        }
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
