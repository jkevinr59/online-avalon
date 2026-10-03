import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export const PLAYER_TOKEN = 'avalon.playerToken';
export const HOST_TOKEN = 'avalon.hostToken';

export const ROLE_INFO = {
  GOOD: { label: 'Loyal Servant of Arthur', short: 'Good', cls: 'good' },
  MERLIN: { label: 'Merlin', short: 'Merlin', cls: 'merlin' },
  EVIL: { label: 'Minion of Mordred', short: 'Evil', cls: 'evil' },
};

// localStorage can throw (private mode, blocked storage), so every access is guarded.
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useStoredToken(key) {
  const [token, setToken] = useState(() => readStorage(key));
  const update = useCallback(
    (value) => {
      try {
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
      } catch {
        /* keep it in memory only */
      }
      setToken(value || null);
    },
    [key],
  );
  return [token, update];
}

export async function postJson(url, body) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Cannot reach the server.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

// One socket per token. Receives the per-viewer state and sends actions.
export function useGame(token, onInvalid) {
  const [view, setView] = useState(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const onInvalidRef = useRef(onInvalid);
  onInvalidRef.current = onInvalid;

  useEffect(() => {
    if (!token) return undefined;
    const socket = io({ auth: { token } });
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => {
      if (err.message === 'unauthorized') onInvalidRef.current?.('Your session is no longer valid. Please log in again.');
    });
    socket.on('kicked', (msg) => onInvalidRef.current?.(msg));
    socket.on('state', setView);
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const act = useCallback(
    (type, payload = {}) =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve({ ok: false, error: 'Not connected to the server. Reconnecting…' });
        socket.timeout(8000).emit('action', { type, ...payload }, (err, res) =>
          resolve(err ? { ok: false, error: 'The server did not respond. Try again.' } : res),
        );
      }),
    [],
  );

  return { view, connected, act };
}

// Wraps act() with a short-lived error message for the UI.
export function useActions(act) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(''), 5000);
    return () => clearTimeout(t);
  }, [error]);
  const run = useCallback(
    async (type, payload) => {
      setBusy(true);
      const res = await act(type, payload);
      setBusy(false);
      if (!res?.ok) setError(res?.error || 'Something went wrong.');
      return res;
    },
    [act],
  );
  return { run, error, busy, clearError: () => setError('') };
}

export const nameOf = (view, id) => view.players.find((p) => p.id === id)?.name ?? '?';
export const namesOf = (view, ids) => ids.map((id) => nameOf(view, id));
export const listNames = (names) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

export function reasonText(view) {
  const r = view.result;
  if (!r) return '';
  const guess = r.merlinGuess ? nameOf(view, r.merlinGuess) : null;
  const merlin = view.players.find((p) => p.role === 'MERLIN');
  switch (r.reason) {
    case '5_rejections':
      return 'Five team proposals in a row were rejected.';
    case '3_quests_failed':
      return 'Three quests failed.';
    case 'merlin_found':
      return `Good completed 3 quests, but Evil found Merlin (${guess}).`;
    case 'merlin_safe':
      return `Good completed 3 quests. Evil guessed ${guess}, but Merlin was ${merlin?.name ?? '?'}.`;
    case 'aborted':
      return 'The host ended the game early.';
    default:
      return '';
  }
}
