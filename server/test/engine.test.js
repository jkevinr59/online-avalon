import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, newLobby, GameError } from '../game/engine.js';
import { Game, HOST, SYSTEM, as, makeCtx, PHASE, ROLE } from './helpers.js';

const EXPECTED = { 5: [3, 2], 6: [4, 2], 7: [4, 3], 8: [5, 3], 9: [6, 3], 10: [6, 4] };

test('role distribution matches the rules for 5-10 players', () => {
  for (const [n, [good, evil]] of Object.entries(EXPECTED)) {
    for (let seed = 1; seed <= 5; seed++) {
      const g = new Game(Number(n), seed);
      assert.equal(g.byRole(ROLE.MERLIN).length, 1);
      assert.equal(g.byRole(ROLE.GOOD).length, good - 1);
      assert.equal(g.evil.length, evil);
      assert.equal(g.state.phase, PHASE.TEAM_BUILDING);
    }
  }
});

test('cannot start with fewer than 5 or more than 10 players; only host starts', () => {
  const ctx = makeCtx();
  let s = newLobby();
  for (let i = 1; i <= 4; i++) s = apply(s, { type: 'join', playerId: `p${i}`, name: `P${i}` }, { kind: 'system' }, ctx).state;
  assert.throws(() => apply(s, { type: 'start' }, HOST, ctx), GameError);
  s = apply(s, { type: 'join', playerId: 'p5', name: 'P5' }, { kind: 'system' }, ctx).state;
  assert.throws(() => apply(s, { type: 'start' }, as('p1'), ctx), /host/);
  for (let i = 6; i <= 10; i++) s = apply(s, { type: 'join', playerId: `p${i}`, name: `P${i}` }, { kind: 'system' }, ctx).state;
  assert.throws(() => apply(s, { type: 'join', playerId: 'p11', name: 'P11' }, { kind: 'system' }, ctx), /full/);
});

test('duplicate names are rejected (case-insensitive)', () => {
  const ctx = makeCtx();
  const s = apply(newLobby(), { type: 'join', playerId: 'a', name: 'Arthur' }, { kind: 'system' }, ctx).state;
  assert.throws(() => apply(s, { type: 'join', playerId: 'b', name: ' arthur ' }, { kind: 'system' }, ctx), /taken/);
});

test('only the leader proposes, with exactly the quest size', () => {
  const g = new Game(5);
  const other = g.ids.find((id) => id !== g.leader);
  assert.throws(() => g.do({ type: 'propose', team: g.teamOf([]) }, as(other)), /leader/);
  assert.throws(() => g.propose(g.ids.slice(0, 3)), /exactly 2/);
  assert.throws(() => g.propose([g.ids[0], g.ids[0]]), /exactly 2/);
  g.propose(g.teamOf([]));
  assert.equal(g.state.phase, PHASE.TEAM_VOTE);
});

test('a tied vote rejects and passes leadership clockwise', () => {
  const g = new Game(6);
  const firstLeaderIdx = g.state.leaderIdx;
  g.propose(g.teamOf([]));
  const yes = new Set(g.ids.slice(0, 3));
  g.voteAll((id) => yes.has(id));
  assert.equal(g.state.phase, PHASE.TEAM_BUILDING);
  assert.equal(g.state.rejectCount, 1);
  assert.equal(g.state.leaderIdx, (firstLeaderIdx + 1) % 6);
  assert.equal(g.state.voteHistory.at(-1).approved, false);
});

test('strict majority approves and resets the reject counter', () => {
  const g = new Game(5);
  g.propose(g.teamOf([]));
  g.voteAll(false);
  g.propose(g.teamOf([]));
  const yes = new Set(g.ids.slice(0, 3));
  g.voteAll((id) => yes.has(id));
  assert.equal(g.state.phase, PHASE.QUEST);
  assert.equal(g.state.rejectCount, 0);
});

test('5 rejected proposals in a row: Evil wins', () => {
  const g = new Game(7);
  for (let i = 0; i < 5; i++) {
    g.propose(g.teamOf([]));
    g.voteAll(false);
  }
  assert.equal(g.state.phase, PHASE.GAME_OVER);
  assert.deepEqual([g.state.result.winner, g.state.result.reason], [ROLE.EVIL, '5_rejections']);
});

test('Good and Merlin cannot play Fail; Evil can; cards cannot be changed', () => {
  const g = new Game(5);
  const team = g.teamOf([g.byRole(ROLE.MERLIN)[0], g.evil[0]]);
  g.propose(team);
  g.voteAll(true);
  assert.throws(() => g.do({ type: 'quest', success: false }, as(team[0])), /must play Success/);
  const outsider = g.ids.find((id) => !team.includes(id));
  assert.throws(() => g.do({ type: 'quest', success: true }, as(outsider)), /not on this quest/);
  g.do({ type: 'quest', success: true }, as(team[0]));
  assert.throws(() => g.do({ type: 'quest', success: true }, as(team[0])), /already/);
  g.do({ type: 'quest', success: false }, as(team[1]));
  assert.equal(g.state.quests[0].result, 'FAIL');
  assert.deepEqual([g.state.lastQuest.successes, g.state.lastQuest.fails], [1, 1]);
  assert.deepEqual(g.state.questCards, {});
});

test('Quest 4 needs two Fail cards with 7+ players', () => {
  for (const fails of [1, 2]) {
    const g = new Game(7, 3);
    // Quests 1-3: success, fail, success so the game is still open at quest 4.
    g.runQuest(g.teamOf(g.good));
    g.runQuest(g.teamOf([g.evil[0]]), [g.evil[0]]);
    g.runQuest(g.teamOf(g.good));
    assert.equal(g.state.round, 3);
    assert.equal(g.state.quests[3].failsNeeded, 2);
    const failers = g.evil.slice(0, fails);
    g.runQuest(g.teamOf(failers), failers);
    assert.equal(g.state.quests[3].result, fails === 1 ? 'SUCCESS' : 'FAIL');
  }
  const five = new Game(5);
  assert.equal(five.state.quests[3].failsNeeded, 1);
});

test('three failed quests: Evil wins', () => {
  const g = new Game(5);
  for (let i = 0; i < 3; i++) g.runQuest(g.teamOf([g.evil[0]]), [g.evil[0]]);
  assert.deepEqual([g.state.result.winner, g.state.result.reason], [ROLE.EVIL, '3_quests_failed']);
});

function toMerlinVote(n, seed) {
  const g = new Game(n, seed);
  for (let i = 0; i < 3; i++) g.runQuest(g.teamOf(g.good));
  assert.equal(g.state.phase, PHASE.MERLIN_VOTE);
  return g;
}

test('Merlin vote needs a strict majority of Evil; wrong guess means Good wins', () => {
  const g = toMerlinVote(7, 4); // 3 evil -> 2 votes needed
  const merlin = g.byRole(ROLE.MERLIN)[0];
  const servant = g.byRole(ROLE.GOOD)[0];
  const [e1, e2, e3] = g.evil;
  assert.throws(() => g.do({ type: 'merlinVote', target: merlin }, as(servant)), /Minions/);
  assert.throws(() => g.do({ type: 'merlinVote', target: e2 }, as(e1)), /Good players/);
  g.do({ type: 'merlinVote', target: servant }, as(e1));
  g.do({ type: 'merlinVote', target: merlin }, as(e2));
  assert.equal(g.state.phase, PHASE.MERLIN_VOTE);
  g.do({ type: 'merlinVote', target: servant }, as(e3));
  assert.deepEqual([g.state.result.winner, g.state.result.reason, g.state.result.merlinGuess], [ROLE.GOOD, 'merlin_safe', servant]);
});

test('Evil finding Merlin steals the win; votes can change', () => {
  const g = toMerlinVote(5, 2); // 2 evil -> both must agree
  const merlin = g.byRole(ROLE.MERLIN)[0];
  const servant = g.byRole(ROLE.GOOD)[0];
  const [e1, e2] = g.evil;
  g.do({ type: 'merlinVote', target: servant }, as(e1));
  g.do({ type: 'merlinVote', target: merlin }, as(e2));
  assert.equal(g.state.phase, PHASE.MERLIN_VOTE);
  g.do({ type: 'merlinVote', target: merlin }, as(e1));
  assert.deepEqual([g.state.result.winner, g.state.result.reason], [ROLE.EVIL, 'merlin_found']);
});

test('host can abort a running game and start a new lobby with the same players', () => {
  const g = new Game(5);
  assert.throws(() => g.do({ type: 'abort' }, as(g.ids[0])), /host/);
  g.do({ type: 'abort' }, HOST);
  assert.equal(g.state.result.reason, 'aborted');
  g.do({ type: 'reset' }, HOST);
  assert.equal(g.state.phase, PHASE.LOBBY);
  assert.equal(g.state.players.length, 5);
  assert.deepEqual(g.state.roles, {});
  g.do({ type: 'start' }, HOST);
  g.do({ type: 'abort' }, HOST);
  g.do({ type: 'reset', empty: true }, HOST);
  assert.equal(g.state.phase, PHASE.LOBBY);
  assert.deepEqual(g.state.players, []);
});

test('kick and leave only work in the lobby', () => {
  const ctx = makeCtx();
  let s = newLobby();
  for (const id of ['a', 'b']) s = apply(s, { type: 'join', playerId: id, name: id }, { kind: 'system' }, ctx).state;
  s = apply(s, { type: 'kick', playerId: 'a' }, HOST, ctx).state;
  s = apply(s, { type: 'leave' }, as('b'), ctx).state;
  assert.equal(s.players.length, 0);
  const g = new Game(5);
  assert.throws(() => g.do({ type: 'kick', playerId: g.ids[0] }, HOST), GameError);
});

test('unknown actions are rejected without touching state', () => {
  const g = new Game(5);
  const before = JSON.stringify(g.state);
  assert.throws(() => g.do({ type: 'constructor' }, HOST), /Unknown/);
  assert.throws(() => g.do({ type: 'nope' }, HOST), /Unknown/);
  assert.equal(JSON.stringify(g.state), before);
});

test('votes and quests pause on a result phase until the timer or host continues', () => {
  const g = new Game(5);
  const leaderIdx = g.state.leaderIdx;
  g.propose(g.teamOf([]));
  for (const id of g.ids) g.do({ type: 'vote', approve: false }, as(id));
  assert.equal(g.state.phase, PHASE.VOTE_RESULT);
  assert.equal(g.state.pauseUntil, 21000);
  assert.equal(g.state.rejectCount, 1);
  assert.equal(g.state.leaderIdx, leaderIdx); // leadership only passes after the pause
  assert.throws(() => g.do({ type: 'continue' }, as(g.ids[0])), /host/);
  g.do({ type: 'continue' }, HOST);
  assert.equal(g.state.phase, PHASE.TEAM_BUILDING);
  assert.equal(g.state.leaderIdx, (leaderIdx + 1) % 5);
  assert.equal(g.state.pauseUntil, null);
  assert.throws(() => g.do({ type: 'continue' }, SYSTEM), /not available/);

  const team = g.teamOf([]);
  g.propose(team);
  for (const id of g.ids) g.do({ type: 'vote', approve: true }, as(id));
  g.continue();
  assert.equal(g.state.phase, PHASE.QUEST);
  for (const id of team) g.do({ type: 'quest', success: true }, as(id));
  assert.equal(g.state.phase, PHASE.QUEST_RESULT);
  assert.equal(g.state.quests[0].result, 'SUCCESS');
  assert.deepEqual(g.state.lastQuest.team, team);
  assert.equal(g.state.round, 0);
  g.continue();
  assert.deepEqual([g.state.phase, g.state.round], [PHASE.TEAM_BUILDING, 1]);
});

test('the 5th rejection and the 3rd failed quest end the game after the pause', () => {
  const g = new Game(5);
  for (let i = 0; i < 5; i++) {
    g.propose(g.teamOf([]));
    for (const id of g.ids) g.do({ type: 'vote', approve: false }, as(id));
    if (i < 4) g.continue();
  }
  assert.equal(g.state.phase, PHASE.VOTE_RESULT);
  g.continue();
  assert.deepEqual([g.state.phase, g.state.result.reason], [PHASE.GAME_OVER, '5_rejections']);

  const h = new Game(5);
  for (let i = 0; i < 2; i++) h.runQuest(h.teamOf([h.evil[0]]), [h.evil[0]]);
  const team = h.teamOf([h.evil[0]]);
  h.propose(team);
  h.voteAll(true);
  for (const id of team) h.do({ type: 'quest', success: id !== h.evil[0] }, as(id));
  assert.equal(h.state.phase, PHASE.QUEST_RESULT);
  h.continue();
  assert.deepEqual([h.state.phase, h.state.result.reason], [PHASE.GAME_OVER, '3_quests_failed']);
});

test('dev role names get their role, first joined first, only while seats are left', () => {
  const names = ['alwaysmerlin', 'alwaysmerlin2', 'AlwaysEvil', 'alwaysevil-b', 'alwaysevil-c', 'alwaysgood', 'Player 7'];
  for (let seed = 1; seed <= 10; seed++) {
    const g = new Game(7, seed, { names, devRoles: true }); // 7 players: 4 good (incl. Merlin), 3 evil
    const role = (name) => g.state.roles[g.state.players.find((p) => p.name === name).id];
    assert.equal(role('alwaysmerlin'), ROLE.MERLIN);
    assert.notEqual(role('alwaysmerlin2'), ROLE.MERLIN);
    assert.deepEqual(['AlwaysEvil', 'alwaysevil-b', 'alwaysevil-c'].map(role), [ROLE.EVIL, ROLE.EVIL, ROLE.EVIL]);
    assert.equal(role('alwaysgood'), ROLE.GOOD);
    assert.equal(g.byRole(ROLE.MERLIN).length, 1);
    assert.equal(g.evil.length, 3);
  }
  // Without the dev flag the names mean nothing.
  const merlins = new Set();
  for (let seed = 1; seed <= 20; seed++) merlins.add(new Game(5, seed, { names }).byRole(ROLE.MERLIN)[0]);
  assert.ok(merlins.size > 1);
});
