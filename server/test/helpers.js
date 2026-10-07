import { apply, newLobby, leaderId, PHASE, ROLE } from '../game/engine.js';
import { openDb } from '../db.js';

const db = openDb(':memory:');

// Deterministic RNG so failures are reproducible.
export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCtx(seed = 1, extra = {}) {
  let id = 0;
  return { rulesFor: db.rulesFor, rng: mulberry32(seed), newId: () => `game${++id}`, now: () => 1000, pauseMs: 20000, ...extra };
}

export const HOST = { kind: 'host' };
export const SYSTEM = { kind: 'system' };
export const as = (playerId) => ({ kind: 'player', playerId });

// Wraps the engine so tests read like a script.
export class Game {
  constructor(n, seed = 1, { names = [], devRoles = false } = {}) {
    this.ctx = makeCtx(seed, { devRoles });
    this.state = newLobby();
    for (let i = 1; i <= n; i++) this.do({ type: 'join', playerId: `p${i}`, name: names[i - 1] ?? `Player ${i}` }, SYSTEM);
    this.do({ type: 'start' }, HOST);
  }
  do(action, actor) {
    const r = apply(this.state, action, actor, this.ctx);
    this.state = r.state;
    return r.events;
  }
  get ids() {
    return this.state.players.map((p) => p.id);
  }
  get leader() {
    return leaderId(this.state);
  }
  byRole(role) {
    return this.ids.filter((id) => this.state.roles[id] === role);
  }
  get good() {
    return this.ids.filter((id) => this.state.roles[id] !== ROLE.EVIL);
  }
  get evil() {
    return this.byRole(ROLE.EVIL);
  }
  get questSize() {
    return this.state.quests[this.state.round].size;
  }
  propose(team) {
    return this.do({ type: 'propose', team }, as(this.leader));
  }
  // Everyone votes, then the result pause ends (as the server timer would).
  voteAll(approve) {
    for (const id of this.ids) this.do({ type: 'vote', approve: typeof approve === 'function' ? approve(id) : approve }, as(id));
    this.continue();
  }
  continue() {
    return this.do({ type: 'continue' }, SYSTEM);
  }
  // Proposes `team`, approves it, then plays cards: ids in `failers` play Fail.
  runQuest(team, failers = []) {
    this.propose(team);
    this.voteAll(true);
    for (const id of team) this.do({ type: 'quest', success: !failers.includes(id) }, as(id));
    this.continue();
  }
  // A team of `size` built from `preferred` first, topped up with others.
  teamOf(preferred, size = this.questSize) {
    return [...new Set([...preferred, ...this.ids])].slice(0, size);
  }
}

export { PHASE, ROLE };
