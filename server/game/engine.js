// Pure Avalon state machine. Every action goes through apply(), which returns
// a new state plus a list of events for the history log. Nothing in here
// touches the network or the database, so it is easy to unit test.

export const PHASE = {
  LOBBY: 'LOBBY',
  TEAM_BUILDING: 'TEAM_BUILDING',
  TEAM_VOTE: 'TEAM_VOTE',
  VOTE_RESULT: 'VOTE_RESULT', // pause: everyone sees the vote before the game moves on
  QUEST: 'QUEST',
  QUEST_RESULT: 'QUEST_RESULT', // pause: everyone sees the quest outcome
  MERLIN_VOTE: 'MERLIN_VOTE',
  GAME_OVER: 'GAME_OVER',
};

export const ROLE = { GOOD: 'GOOD', MERLIN: 'MERLIN', EVIL: 'EVIL' };

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;
export const MAX_REJECTS = 5;
export const NAME_MAX = 20;
// Development only (ctx.devRoles): players named e.g. "alwaysmerlin" or
// "alwaysevil2" get that role while seats of that role are left.
export const DEV_ROLE_NAME = /^always(good|evil|merlin)/i;

export class GameError extends Error {}

export function newLobby(players = []) {
  return {
    phase: PHASE.LOBBY,
    players, // [{ id, name }] - becomes the seat order once the game starts
    gameId: null,
    roles: {}, // playerId -> ROLE
    round: 0, // 0..4, index into quests
    leaderIdx: 0,
    rejectCount: 0, // consecutive rejected proposals this round
    quests: [], // [{ size, failsNeeded, result, successes, fails, team }]
    proposal: null, // [playerId] while voting / questing
    votes: {}, // playerId -> boolean (secret until everyone voted)
    questCards: {}, // playerId -> boolean success (never revealed per player)
    merlinVotes: {}, // evil playerId -> target playerId
    voteHistory: [], // [{ round, attempt, leaderId, team, votes, approved }]
    lastQuest: null, // { round, successes, fails, result, team }
    pauseUntil: null, // ms timestamp when a VOTE_RESULT / QUEST_RESULT pause ends
    result: null, // { winner, reason, merlinGuess }
  };
}

export function cleanName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!name) throw new GameError('Please enter a name.');
  if (name.length > NAME_MAX) throw new GameError(`Name must be at most ${NAME_MAX} characters.`);
  return name;
}

export const leaderId = (s) => s.players[s.leaderIdx]?.id ?? null;
export const evilIds = (s) => s.players.filter((p) => s.roles[p.id] === ROLE.EVIL).map((p) => p.id);
const isPlayer = (s, id) => s.players.some((p) => p.id === id);

function requirePhase(s, ...phases) {
  if (!phases.includes(s.phase)) throw new GameError('That action is not available right now.');
}
function requireHost(actor) {
  if (actor?.kind !== 'host') throw new GameError('Only the host can do that.');
}
function requirePlayer(s, actor) {
  if (actor?.kind !== 'player' || !isPlayer(s, actor.playerId)) throw new GameError('You are not in this game.');
  return actor.playerId;
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function endGame(s, events, winner, reason, extra = {}) {
  s.phase = PHASE.GAME_OVER;
  s.pauseUntil = null;
  s.proposal = null;
  s.votes = {};
  s.questCards = {};
  s.result = { winner, reason, merlinGuess: null, ...extra };
  events.push({ type: 'game_end', ...s.result });
}

function nextLeader(s) {
  s.leaderIdx = nextLeaderIdx(s);
  s.proposal = null;
  s.phase = PHASE.TEAM_BUILDING;
}

const nextLeaderIdx = (s) => (s.leaderIdx + 1) % s.players.length;

function pause(s, ctx, phase) {
  s.phase = phase;
  s.pauseUntil = ctx.now() + ctx.pauseMs;
}

// What happens when the current result pause ends. Public information, so the
// view shows it during the pause ("next leader is ...").
//   { type: 'quest', team } | { type: 'leader', leaderId } | { type: 'merlin' } | { type: 'end', reason }
// Both ways to end here are Evil wins.
export function upNext(s) {
  if (s.phase === PHASE.VOTE_RESULT) {
    if (s.voteHistory.at(-1).approved) return { type: 'quest', team: s.proposal };
    if (s.rejectCount >= MAX_REJECTS) return { type: 'end', reason: '5_rejections' };
    return { type: 'leader', leaderId: s.players[nextLeaderIdx(s)].id };
  }
  if (s.phase === PHASE.QUEST_RESULT) {
    if (s.quests.filter((q) => q.result === 'FAIL').length >= 3) return { type: 'end', reason: '3_quests_failed' };
    if (s.quests.filter((q) => q.result === 'SUCCESS').length >= 3) return { type: 'merlin' };
    return { type: 'leader', leaderId: s.players[nextLeaderIdx(s)].id };
  }
  return null;
}

// Seats get a random role from the deck, except dev-named players (in join
// order) who take their named role while the deck still has one.
function dealRoles(joinOrder, seats, deck, ctx) {
  const left = [...deck];
  const forced = {};
  if (ctx.devRoles) {
    for (const p of joinOrder) {
      const role = DEV_ROLE_NAME.exec(p.name)?.[1].toUpperCase();
      const i = role ? left.indexOf(role) : -1;
      if (i === -1) continue;
      forced[p.id] = role;
      left.splice(i, 1);
    }
  }
  const rest = shuffle(left, ctx.rng);
  return Object.fromEntries(seats.map((p) => [p.id, forced[p.id] ?? rest.pop()]));
}

const handlers = {
  join(s, { playerId, name }, actor) {
    if (actor?.kind !== 'system') throw new GameError('Not allowed.');
    requirePhase(s, PHASE.LOBBY);
    name = cleanName(name);
    if (s.players.length >= MAX_PLAYERS) throw new GameError(`The lobby is full (${MAX_PLAYERS} players max).`);
    if (s.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new GameError('That name is taken.');
    s.players.push({ id: playerId, name });
  },

  leave(s, _a, actor) {
    const me = requirePlayer(s, actor);
    requirePhase(s, PHASE.LOBBY);
    s.players = s.players.filter((p) => p.id !== me);
  },

  kick(s, { playerId }, actor) {
    requireHost(actor);
    requirePhase(s, PHASE.LOBBY);
    if (!isPlayer(s, playerId)) throw new GameError('No such player.');
    s.players = s.players.filter((p) => p.id !== playerId);
  },

  start(s, _a, actor, ctx, events) {
    requireHost(actor);
    requirePhase(s, PHASE.LOBBY);
    const n = s.players.length;
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
      throw new GameError(`Avalon needs ${MIN_PLAYERS}-${MAX_PLAYERS} players (currently ${n}).`);
    }
    const rules = ctx.rulesFor(n);
    if (!rules) throw new GameError(`No rules configured for ${n} players.`);

    const joinOrder = s.players;
    s.players = shuffle(s.players, ctx.rng);
    const deck = [ROLE.MERLIN, ...Array(rules.good - 1).fill(ROLE.GOOD), ...Array(rules.evil).fill(ROLE.EVIL)];
    s.roles = dealRoles(joinOrder, s.players, deck, ctx);
    s.gameId = ctx.newId();
    s.round = 0;
    s.rejectCount = 0;
    s.leaderIdx = Math.floor(ctx.rng() * n);
    s.quests = rules.quests.map((q) => ({ ...q, result: null, successes: 0, fails: 0, team: null }));
    s.proposal = null;
    s.votes = {};
    s.questCards = {};
    s.merlinVotes = {};
    s.voteHistory = [];
    s.lastQuest = null;
    s.pauseUntil = null;
    s.result = null;
    s.phase = PHASE.TEAM_BUILDING;
    events.push({
      type: 'game_start',
      players: s.players.map((p, seat) => ({ seat, id: p.id, name: p.name, role: s.roles[p.id] })),
    });
  },

  propose(s, { team }, actor, _ctx, events) {
    const me = requirePlayer(s, actor);
    requirePhase(s, PHASE.TEAM_BUILDING);
    if (me !== leaderId(s)) throw new GameError('Only the leader can propose a team.');
    const size = s.quests[s.round].size;
    const unique = [...new Set(Array.isArray(team) ? team : [])];
    if (unique.length !== size) throw new GameError(`Pick exactly ${size} players for this quest.`);
    if (!unique.every((id) => isPlayer(s, id))) throw new GameError('Unknown player in team.');
    s.proposal = unique;
    s.votes = {};
    s.phase = PHASE.TEAM_VOTE;
    events.push({ type: 'proposal', round: s.round, leaderId: me, team: unique });
  },

  vote(s, { approve }, actor, ctx, events) {
    const me = requirePlayer(s, actor);
    requirePhase(s, PHASE.TEAM_VOTE);
    if (typeof approve !== 'boolean') throw new GameError('Vote must be approve or reject.');
    s.votes[me] = approve;
    if (Object.keys(s.votes).length < s.players.length) return;

    const approvals = Object.values(s.votes).filter(Boolean).length;
    const approved = approvals * 2 > s.players.length; // strict majority; a tie rejects
    const record = {
      round: s.round,
      attempt: s.rejectCount + 1,
      leaderId: leaderId(s),
      team: s.proposal,
      votes: s.votes,
      approved,
    };
    s.voteHistory.push(record);
    s.votes = {};
    s.rejectCount = approved ? 0 : s.rejectCount + 1;
    events.push({ type: 'vote_result', ...record });
    pause(s, ctx, PHASE.VOTE_RESULT);
  },

  quest(s, { success }, actor, ctx, events) {
    const me = requirePlayer(s, actor);
    requirePhase(s, PHASE.QUEST);
    if (!s.proposal.includes(me)) throw new GameError('You are not on this quest.');
    if (typeof success !== 'boolean') throw new GameError('Play Success or Fail.');
    if (me in s.questCards) throw new GameError('You already played your card.');
    if (!success && s.roles[me] !== ROLE.EVIL) throw new GameError('Loyal servants of Arthur must play Success.');
    s.questCards[me] = success;
    if (Object.keys(s.questCards).length < s.proposal.length) return;

    const quest = s.quests[s.round];
    quest.fails = Object.values(s.questCards).filter((c) => !c).length;
    quest.successes = s.proposal.length - quest.fails;
    quest.result = quest.fails >= quest.failsNeeded ? 'FAIL' : 'SUCCESS';
    s.questCards = {}; // individual cards are never kept
    s.lastQuest = { round: s.round, successes: quest.successes, fails: quest.fails, result: quest.result, team: s.proposal };
    events.push({ type: 'quest_result', ...s.lastQuest });
    pause(s, ctx, PHASE.QUEST_RESULT);
  },

  // Ends a result pause. Sent by the server timer, or by the host to skip it.
  continue(s, _a, actor, _ctx, events) {
    if (actor?.kind !== 'system') requireHost(actor);
    requirePhase(s, PHASE.VOTE_RESULT, PHASE.QUEST_RESULT);
    const next = upNext(s);
    const after = s.phase;
    s.pauseUntil = null;
    if (next.type === 'end') return endGame(s, events, ROLE.EVIL, next.reason);
    if (next.type === 'quest') {
      s.quests[s.round].team = s.proposal;
      s.questCards = {};
      s.phase = PHASE.QUEST;
    } else if (next.type === 'merlin') {
      s.phase = PHASE.MERLIN_VOTE;
      s.proposal = null;
      s.merlinVotes = {};
    } else {
      if (after === PHASE.QUEST_RESULT) s.round += 1;
      nextLeader(s);
    }
  },

  merlinVote(s, { target }, actor, _ctx, events) {
    const me = requirePlayer(s, actor);
    requirePhase(s, PHASE.MERLIN_VOTE);
    if (s.roles[me] !== ROLE.EVIL) throw new GameError('Only the Minions of Mordred choose Merlin.');
    if (!isPlayer(s, target) || s.roles[target] === ROLE.EVIL) throw new GameError('Pick one of the Good players.');
    s.merlinVotes[me] = target;
    events.push({ type: 'merlin_vote', voterId: me, target });

    const needed = Math.floor(evilIds(s).length / 2) + 1;
    const count = Object.values(s.merlinVotes).filter((t) => t === target).length;
    if (count < needed) return;
    const found = s.roles[target] === ROLE.MERLIN;
    endGame(s, events, found ? ROLE.EVIL : ROLE.GOOD, found ? 'merlin_found' : 'merlin_safe', { merlinGuess: target });
  },

  abort(s, _a, actor, _ctx, events) {
    requireHost(actor);
    requirePhase(s, PHASE.TEAM_BUILDING, PHASE.TEAM_VOTE, PHASE.VOTE_RESULT, PHASE.QUEST, PHASE.QUEST_RESULT, PHASE.MERLIN_VOTE);
    endGame(s, events, null, 'aborted');
  },

  // New lobby after a game: with the same players, or empty ({ empty: true }).
  reset(s, { empty = false }, actor) {
    requireHost(actor);
    requirePhase(s, PHASE.GAME_OVER);
    Object.assign(s, newLobby(empty ? [] : s.players));
  },
};

/**
 * @param state  current state (not mutated)
 * @param action { type, ...payload }
 * @param actor  { kind: 'player', playerId } | { kind: 'host' } | { kind: 'system' }
 * @param ctx    { rulesFor(n), rng(), newId(), now(), pauseMs, devRoles }
 * @returns { state, events }
 */
export function apply(state, action, actor, ctx) {
  const handler = Object.hasOwn(handlers, action?.type) ? handlers[action.type] : null;
  if (!handler) throw new GameError('Unknown action.');
  const s = structuredClone(state);
  const events = [];
  handler(s, action, actor, ctx, events);
  return { state: s, events };
}
