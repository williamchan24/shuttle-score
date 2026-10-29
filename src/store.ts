/** Saves the match in progress, finished matches and the voice setting in this browser only. */
import type { MatchState } from './lib/rules';

export interface Finished {
  date: string;
  winnerName: string;
  loserName: string;
  /** Game scores from the winner's side, e.g. "21–18, 19–21, 21–15". */
  games: string;
}

const KEY_CURRENT = 'shuttle:current';
const KEY_HISTORY = 'shuttle:history';
const KEY_VOICE = 'shuttle:voice';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the match still works, it just won't survive a reload */
  }
}

export const loadCurrent = () => read<{ state: MatchState; undo: MatchState[] } | null>(KEY_CURRENT, null);
export const saveCurrent = (state: MatchState | null, undo: MatchState[]) =>
  write(KEY_CURRENT, state && !state.winner ? { state, undo: undo.slice(-50) } : null);

export const loadHistory = () => read<Finished[]>(KEY_HISTORY, []);
export const addToHistory = (m: Finished) => write(KEY_HISTORY, [m, ...loadHistory()].slice(0, 20));

export const loadVoice = () => read<boolean>(KEY_VOICE, false);
export const saveVoice = (on: boolean) => write(KEY_VOICE, on);
