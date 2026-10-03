import { PHASE, ROLE, leaderId, evilIds } from './engine.js';

// Builds what ONE viewer is allowed to see. The full state never leaves the
// server; every socket gets its own projection from here.
//
// viewer: { kind: 'player', playerId } | { kind: 'host' }
// online: Set of playerIds with at least one connected socket
export function viewFor(s, viewer, online = new Set()) {
  const meId = viewer.kind === 'player' ? viewer.playerId : null;
  const myRole = meId ? s.roles[meId] : undefined;
  const inGame = s.phase !== PHASE.LOBBY;
  const live = inGame && s.phase !== PHASE.GAME_OVER;
  const over = s.phase === PHASE.GAME_OVER;
  const evilUnmasked = s.phase === PHASE.MERLIN_VOTE || over;
  const evil = evilIds(s);
  const lead = live ? leaderId(s) : null;
  const team = s.phase === PHASE.TEAM_VOTE || s.phase === PHASE.QUEST ? s.proposal : null;

  const players = s.players.map((p, i) => {
    let role;
    if (over) role = s.roles[p.id];
    else if (evilUnmasked && s.roles[p.id] === ROLE.EVIL) role = ROLE.EVIL;
    return {
      id: p.id,
      name: p.name,
      seat: i + 1,
      online: online.has(p.id),
      isLeader: p.id === lead,
      onTeam: !!team?.includes(p.id),
      hasVoted: s.phase === PHASE.TEAM_VOTE ? p.id in s.votes : false,
      hasPlayed: s.phase === PHASE.QUEST ? p.id in s.questCards : false,
      role,
    };
  });

  let waitingFor = [];
  if (s.phase === PHASE.TEAM_BUILDING) waitingFor = [lead];
  else if (s.phase === PHASE.TEAM_VOTE) waitingFor = s.players.map((p) => p.id).filter((id) => !(id in s.votes));
  else if (s.phase === PHASE.QUEST) waitingFor = s.proposal.filter((id) => !(id in s.questCards));
  else if (s.phase === PHASE.MERLIN_VOTE) waitingFor = evil.filter((id) => !(id in s.merlinVotes));

  let me = null;
  if (meId) {
    let knows = [];
    if (inGame && myRole === ROLE.MERLIN) knows = evil;
    if (inGame && myRole === ROLE.EVIL) knows = evil.filter((id) => id !== meId);
    me = {
      id: meId,
      name: s.players.find((p) => p.id === meId)?.name,
      role: inGame ? myRole : null,
      knows,
      isLeader: meId === lead,
      onTeam: !!team?.includes(meId),
      myVote: s.phase === PHASE.TEAM_VOTE ? s.votes[meId] ?? null : null,
      myQuestCard: s.phase === PHASE.QUEST ? s.questCards[meId] ?? null : null,
    };
  }

  let merlinVote = null;
  if (s.phase === PHASE.MERLIN_VOTE) {
    merlinVote = {
      candidates: s.players.map((p) => p.id).filter((id) => !evil.includes(id)),
      needed: Math.floor(evil.length / 2) + 1,
    };
    if (myRole === ROLE.EVIL) {
      merlinVote.votes = { ...s.merlinVotes }; // evil discuss openly among themselves
      merlinVote.myVote = s.merlinVotes[meId] ?? null;
    }
  }

  return {
    phase: s.phase,
    gameId: s.gameId,
    me,
    players,
    leaderId: lead,
    round: s.round,
    rejectCount: s.rejectCount,
    quests: s.quests.map(({ size, failsNeeded, result, successes, fails, team: t }) => ({
      size,
      failsNeeded,
      result,
      successes,
      fails,
      team: t,
    })),
    proposal: team,
    waitingFor,
    voteHistory: s.voteHistory,
    lastVote: s.voteHistory.at(-1) ?? null,
    lastQuest: s.lastQuest,
    merlinVote,
    result: over ? s.result : null,
  };
}
