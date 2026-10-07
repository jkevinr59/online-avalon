import crypto from 'node:crypto';
import { apply, newLobby, cleanName, GameError, PHASE } from './game/engine.js';
import { viewFor } from './game/view.js';

const newToken = () => crypto.randomBytes(24).toString('base64url');
const newId = () => crypto.randomBytes(6).toString('hex');

// Owns the single live game: state, login sessions, presence, persistence,
// and pushing a per-viewer projection to every connected socket.
export function createHub({ io, db, config }) {
  const saved = db.loadLive();
  let state = saved?.state ?? newLobby();
  const sessions = new Map(saved?.sessions ?? []); // token -> { kind: 'player', playerId } | { kind: 'host' }
  const presence = new Map(); // playerId -> number of connected sockets

  const ctx = {
    rulesFor: db.rulesFor,
    rng: () => crypto.randomInt(2 ** 32) / 2 ** 32,
    newId,
    now: Date.now,
    pauseMs: config.resultPauseMs,
    departPauseMs: config.departPauseMs,
    devRoles: config.devRoles,
  };
  let pauseTimer = null;

  function persist() {
    db.saveLive({ state, sessions: [...sessions] });
  }

  function online() {
    return new Set([...presence].filter(([, n]) => n > 0).map(([id]) => id));
  }

  function adminInfo() {
    return {
      allRules: db.allRules(),
      recentGames: db.recentGames(10),
      lobbyRules: db.rulesFor(state.players.length),
    };
  }

  function broadcast() {
    const on = online();
    const admin = [...io.sockets.sockets.values()].some((s) => s.data.session?.kind === 'host') ? adminInfo() : null;
    for (const socket of io.sockets.sockets.values()) {
      const session = socket.data.session;
      if (!session) continue;
      const view = viewFor(state, session.kind === 'host' ? { kind: 'host' } : session, on);
      view.lobbyRules = state.phase === PHASE.LOBBY ? db.rulesFor(state.players.length) : null;
      if (session.kind === 'host') view.admin = admin;
      socket.emit('state', view);
    }
  }

  function dispatch(action, actor) {
    const result = apply(state, action, actor, ctx);
    state = result.state;
    if (result.events.length && state.gameId) db.recordEvents(state.gameId, result.events);
    persist();
    broadcast();
    schedulePause();
  }

  // A result pause ends by itself; this also resumes one after a restart.
  function schedulePause() {
    clearTimeout(pauseTimer);
    pauseTimer = null;
    if (state.pauseUntil == null) return;
    pauseTimer = setTimeout(() => {
      try {
        dispatch({ type: 'continue' }, { kind: 'system' });
      } catch (err) {
        console.error(err);
      }
    }, Math.max(0, state.pauseUntil - Date.now()));
  }
  schedulePause();

  function dropPlayerSessions(playerId, reason) {
    for (const [token, s] of sessions) if (s.kind === 'player' && s.playerId === playerId) sessions.delete(token);
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.session?.playerId === playerId) {
        socket.emit('kicked', reason);
        socket.disconnect(true);
      }
    }
  }

  // Player login. A name that already exists and is offline is taken over,
  // so someone whose phone lost its session can get back into their seat.
  function joinAsPlayer(rawName) {
    const name = cleanName(rawName);
    const existing = state.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    let playerId;
    if (existing) {
      if (online().has(existing.id)) throw new GameError('That name is already in use by a connected player.');
      playerId = existing.id;
    } else {
      if (state.phase !== PHASE.LOBBY) {
        throw new GameError('A game is in progress. Wait for the host to finish it, or rejoin with your previous name.');
      }
      playerId = newId();
      dispatch({ type: 'join', playerId, name }, { kind: 'system' });
    }
    const token = newToken();
    sessions.set(token, { kind: 'player', playerId });
    persist();
    return { token, playerId, name: existing?.name ?? name };
  }

  function hostLogin() {
    const token = newToken();
    sessions.set(token, { kind: 'host' });
    persist();
    return { token };
  }

  // Socket auth: the token from login must map to a live session.
  io.use((socket, next) => {
    const session = sessions.get(socket.handshake.auth?.token);
    if (!session) return next(new Error('unauthorized'));
    if (session.kind === 'player' && !state.players.some((p) => p.id === session.playerId)) {
      return next(new Error('unauthorized'));
    }
    socket.data.session = session;
    next();
  });

  io.on('connection', (socket) => {
    const session = socket.data.session;
    if (session.kind === 'player') presence.set(session.playerId, (presence.get(session.playerId) ?? 0) + 1);
    broadcast();

    socket.on('disconnect', () => {
      if (session.kind === 'player') presence.set(session.playerId, Math.max(0, (presence.get(session.playerId) ?? 1) - 1));
      broadcast();
    });

    socket.on('action', (action, ack = () => {}) => {
      try {
        if (typeof action !== 'object' || action === null) throw new GameError('Bad request.');
        if (session.kind === 'host' && action.type === 'joinAsPlayer') return ack({ ok: true, ...joinAsPlayer(action.name) });

        const actor = session.kind === 'host' ? { kind: 'host' } : { kind: 'player', playerId: session.playerId };
        if (action.type === 'join') throw new GameError('Not allowed.');
        const before = state.players;
        dispatch(action, actor);

        if (action.type === 'reset' && action.empty) {
          for (const p of before) dropPlayerSessions(p.id, 'The host started a new, empty lobby. Join again to play.');
        }
        if (action.type === 'kick') dropPlayerSessions(action.playerId, 'You were removed from the lobby by the host.');
        if (action.type === 'leave') dropPlayerSessions(session.playerId, 'You left the lobby.');
        ack({ ok: true });
      } catch (err) {
        if (!(err instanceof GameError)) console.error(err);
        ack({ ok: false, error: err instanceof GameError ? err.message : 'Something went wrong.' });
      }
    });
  });

  return { joinAsPlayer, hostLogin, getState: () => state, stop: () => clearTimeout(pauseTimer) };
}
