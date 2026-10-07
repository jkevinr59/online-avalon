import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewFor } from '../game/view.js';
import { Game, as, mulberry32, PHASE, ROLE } from './helpers.js';

// Checks what every viewer can see in the current state.
function checkNoLeaks(g) {
  const s = g.state;
  const hostView = JSON.stringify(viewFor(s, { kind: 'host' }));
  const unmasked = s.phase === PHASE.MERLIN_VOTE || s.phase === PHASE.GAME_OVER;

  if (!unmasked) {
    for (const role of Object.values(ROLE)) assert.ok(!hostView.includes(`"${role}"`), `host saw ${role} in ${s.phase}`);
  }

  for (const id of g.ids) {
    const role = s.roles[id];
    const v = viewFor(s, as(id));
    const json = JSON.stringify(v);
    assert.equal(v.me.role, role);

    if (s.phase !== PHASE.GAME_OVER) {
      for (const p of v.players) {
        if (unmasked) assert.ok(p.role === undefined || (p.role === ROLE.EVIL && s.roles[p.id] === ROLE.EVIL));
        else assert.equal(p.role, undefined);
      }
    }
    if (!unmasked && role !== ROLE.MERLIN) assert.ok(!json.includes('"MERLIN"'), `${role} saw MERLIN`);
    if (!unmasked && role === ROLE.GOOD) assert.ok(!json.includes('"EVIL"'), 'servant saw EVIL');

    // Knowledge: Merlin sees all evil, evil sees fellow evil, servants see nobody.
    const evil = g.evil;
    if (role === ROLE.MERLIN) assert.deepEqual([...v.me.knows].sort(), [...evil].sort());
    if (role === ROLE.EVIL) assert.deepEqual([...v.me.knows].sort(), evil.filter((e) => e !== id).sort());
    if (role === ROLE.GOOD) assert.deepEqual(v.me.knows, []);

    // Secret votes and quest cards never show up in someone else's view.
    if (s.phase === PHASE.TEAM_VOTE) {
      for (const other of g.ids) if (other !== id && other in s.votes) assert.equal(v.players.find((p) => p.id === other).hasVoted, true);
      assert.ok(!('votes' in v) && !json.includes('"questCards"'));
    }
    if (s.phase === PHASE.MERLIN_VOTE && role !== ROLE.EVIL) assert.equal(v.merlinVote.votes, undefined);
  }
}

test('no hidden information leaks across many random games', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const n = 5 + (seed % 6);
    const g = new Game(n, seed);
    const rng = mulberry32(seed * 7919);
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    checkNoLeaks(g);
    let steps = 0;
    while (g.state.phase !== PHASE.GAME_OVER && steps++ < 500) {
      const s = g.state;
      if (s.phase === PHASE.TEAM_BUILDING) {
        const shuffled = [...g.ids].sort(() => rng() - 0.5);
        g.propose(shuffled.slice(0, g.questSize));
      } else if (s.phase === PHASE.TEAM_VOTE) {
        const id = g.ids.find((p) => !(p in s.votes));
        g.do({ type: 'vote', approve: rng() < 0.65 }, as(id));
      } else if (s.phase === PHASE.QUEST) {
        const id = s.proposal.find((p) => !(p in s.questCards));
        g.do({ type: 'quest', success: s.roles[id] !== ROLE.EVIL || rng() < 0.4 }, as(id));
      } else if (s.phase === PHASE.MERLIN_VOTE) {
        const candidates = g.ids.filter((p) => s.roles[p] !== ROLE.EVIL);
        const voter = g.evil.find((e) => !(e in s.merlinVotes)) ?? g.evil[0];
        const leading = Object.values(s.merlinVotes)[0];
        g.do({ type: 'merlinVote', target: leading ?? pick(candidates) }, as(voter));
      } else {
        g.continue();
      }
      checkNoLeaks(g);
    }
    assert.equal(g.state.phase, PHASE.GAME_OVER, `seed ${seed} did not finish`);
    assert.ok(['5_rejections', '3_quests_failed', 'merlin_found', 'merlin_safe'].includes(g.state.result.reason));
    // Game over reveals everyone.
    const v = viewFor(g.state, { kind: 'host' });
    assert.ok(v.players.every((p) => p.role));
  }
});

test('waitingFor tracks who still has to act', () => {
  const g = new Game(5);
  assert.deepEqual(viewFor(g.state, { kind: 'host' }).waitingFor, [g.leader]);
  g.propose(g.teamOf([]));
  g.do({ type: 'vote', approve: true }, as(g.ids[0]));
  assert.deepEqual(viewFor(g.state, { kind: 'host' }).waitingFor, g.ids.slice(1));
});

test('result pause shows the vote and announces the next leader', () => {
  const g = new Game(5);
  const nextLeader = g.ids[(g.state.leaderIdx + 1) % 5];
  g.propose(g.teamOf([]));
  for (const id of g.ids) g.do({ type: 'vote', approve: false }, as(id));
  const v = viewFor(g.state, as(g.ids[0]), new Set(), 6000);
  assert.equal(v.phase, PHASE.VOTE_RESULT);
  assert.equal(v.lastVote.approved, false);
  assert.deepEqual(v.reveal, { kind: 'vote', next: { type: 'leader', leaderId: nextLeader }, remainingMs: 5000 });
  assert.deepEqual(v.waitingFor, []);
});
