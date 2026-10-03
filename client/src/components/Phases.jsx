import { useEffect, useState } from 'react';
import { listNames, nameOf, namesOf, reasonText } from '../lib.js';
import { RoleTag } from './Board.jsx';

const questNo = (view) => view.round + 1;
const teamSize = (view) => view.quests[view.round]?.size;

// One sentence telling the viewer what to do now, or who everyone waits for.
export function StatusBanner({ view }) {
  const { me, phase } = view;
  const waiting = listNames(namesOf(view, view.waitingFor));
  const leader = view.leaderId ? nameOf(view, view.leaderId) : '';
  let text = '';
  let action = false;

  if (phase === 'TEAM_BUILDING') {
    action = !!me?.isLeader;
    text = action
      ? `You are the leader. Choose ${teamSize(view)} players for Quest ${questNo(view)}.`
      : `${leader} is choosing ${teamSize(view)} players for Quest ${questNo(view)}.`;
  } else if (phase === 'TEAM_VOTE') {
    action = !!me && me.myVote === null;
    text = action ? `Vote on ${leader}'s team for Quest ${questNo(view)}.` : `Waiting for votes from ${waiting}.`;
  } else if (phase === 'QUEST') {
    action = !!me?.onTeam && me.myQuestCard === null;
    text = action ? `You are on Quest ${questNo(view)}. Play your card.` : `Quest ${questNo(view)} in progress. Waiting for ${waiting}.`;
  } else if (phase === 'MERLIN_VOTE') {
    action = me?.role === 'EVIL';
    text = action
      ? 'Good completed 3 quests! Discuss with your team and vote for who you think Merlin is.'
      : 'Good completed 3 quests! Evil now tries to find Merlin…';
  }
  if (!text) return null;
  return (
    <div className={`banner ${action ? 'banner-action' : ''}`} role="status">
      {action && <span className="banner-label">Your turn</span>}
      {text}
    </div>
  );
}

function TeamChips({ view, ids }) {
  return (
    <div className="chips">
      {ids.map((id) => (
        <span key={id} className={`chip ${id === view.me?.id ? 'chip-self' : ''}`}>
          {nameOf(view, id)}
        </span>
      ))}
    </div>
  );
}

export function TeamPicker({ view, run, busy }) {
  const [picked, setPicked] = useState([]);
  const size = teamSize(view);
  // Start fresh whenever a new proposal round begins.
  useEffect(() => setPicked([]), [view.round, view.rejectCount]);
  if (!view.me?.isLeader) return null;

  const toggle = (id) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < size ? [...cur, id] : cur));

  return (
    <section className="card">
      <h3>
        Choose your team <span className="muted">({picked.length}/{size})</span>
      </h3>
      <div className="pick-grid">
        {view.players.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn btn-pick ${picked.includes(p.id) ? 'picked' : ''}`}
            onClick={() => toggle(p.id)}
            aria-pressed={picked.includes(p.id)}
          >
            {picked.includes(p.id) ? '✓ ' : ''}
            {p.name}
            {p.id === view.me.id ? ' (you)' : ''}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={picked.length !== size || busy}
        onClick={() => run('propose', { team: picked })}
      >
        Propose this team
      </button>
    </section>
  );
}

export function VotePanel({ view, run, busy }) {
  const voted = view.players.filter((p) => p.hasVoted).length;
  const my = view.me?.myVote;
  return (
    <section className="card">
      <h3>
        {nameOf(view, view.leaderId)}'s proposed team for Quest {questNo(view)}
      </h3>
      <TeamChips view={view} ids={view.proposal} />
      {view.me && (
        <>
          <div className="btn-row">
            <button type="button" className={`btn btn-approve ${my === true ? 'chosen' : ''}`} disabled={busy} onClick={() => run('vote', { approve: true })}>
              Approve
            </button>
            <button type="button" className={`btn btn-reject ${my === false ? 'chosen' : ''}`} disabled={busy} onClick={() => run('vote', { approve: false })}>
              Reject
            </button>
          </div>
          <p className="hint">
            {my === null ? 'Your vote is secret until everyone has voted.' : `You voted ${my ? 'Approve' : 'Reject'}. You can change it until the last vote is in.`}
          </p>
        </>
      )}
      <p className="hint">
        {voted}/{view.players.length} voted. A team needs more than half the votes to be approved.
        {view.rejectCount === 4 && <strong className="warn"> If this team is rejected, Evil wins!</strong>}
      </p>
    </section>
  );
}

export function QuestPanel({ view, run, busy }) {
  const { me } = view;
  const played = view.players.filter((p) => p.hasPlayed).length;
  const q = view.quests[view.round];
  return (
    <section className="card">
      <h3>Quest {questNo(view)} team</h3>
      <TeamChips view={view} ids={view.proposal} />
      {me?.onTeam && me.myQuestCard === null && (
        <>
          <div className="btn-row">
            <button type="button" className="btn btn-success" disabled={busy} onClick={() => run('quest', { success: true })}>
              Success
            </button>
            {me.role === 'EVIL' && (
              <button type="button" className="btn btn-fail" disabled={busy} onClick={() => run('quest', { success: false })}>
                Fail
              </button>
            )}
          </div>
          <p className="hint">
            {me.role === 'EVIL'
              ? 'Your card is anonymous. Only the totals are revealed.'
              : 'Loyal servants of Arthur always play Success.'}
          </p>
        </>
      )}
      {me?.onTeam && me.myQuestCard !== null && (
        <p className="hint">You played {me.myQuestCard ? 'Success' : 'Fail'}. Your card can't be changed.</p>
      )}
      <p className="hint">
        {played}/{view.proposal.length} cards played.
        {q?.failsNeeded > 1 ? ' This quest needs 2 Fail cards to fail.' : ' One Fail card fails this quest.'}
      </p>
    </section>
  );
}

export function MerlinVotePanel({ view, run, busy }) {
  const mv = view.merlinVote;
  const evil = view.players.filter((p) => p.role === 'EVIL');
  const isEvil = view.me?.role === 'EVIL';
  const tally = {};
  for (const [voter, target] of Object.entries(mv.votes ?? {})) (tally[target] ??= []).push(voter);

  return (
    <section className="card">
      <h3>Find Merlin</h3>
      <p>
        The Minions of Mordred reveal themselves: <strong>{listNames(evil.map((p) => p.name))}</strong>
      </p>
      {isEvil ? (
        <>
          <p className="hint">
            Talk it over with your team. The guess locks when <strong>{mv.needed}</strong> of you vote for the same player.
          </p>
          <div className="pick-grid">
            {mv.candidates.map((id) => (
              <button
                key={id}
                type="button"
                className={`btn btn-pick ${mv.myVote === id ? 'picked' : ''}`}
                disabled={busy}
                onClick={() => run('merlinVote', { target: id })}
              >
                {nameOf(view, id)}
                {tally[id] && <span className="vote-count"> · {tally[id].length} vote{tally[id].length > 1 ? 's' : ''}</span>}
              </button>
            ))}
          </div>
          {Object.keys(tally).length > 0 && (
            <ul className="tally">
              {Object.entries(tally).map(([target, voters]) => (
                <li key={target}>
                  <strong>{nameOf(view, target)}</strong>: {listNames(namesOf(view, voters))}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="hint">If Evil names Merlin correctly, Evil wins. Otherwise Good wins.</p>
      )}
    </section>
  );
}

export function GameOverPanel({ view }) {
  const w = view.result?.winner;
  const title = w === 'GOOD' ? 'Good wins!' : w === 'EVIL' ? 'Evil wins!' : 'Game ended';
  return (
    <section className={`card gameover ${w === 'GOOD' ? 'won-good' : w === 'EVIL' ? 'won-evil' : ''}`}>
      <h2>{title}</h2>
      <p>{reasonText(view)}</p>
      <h3>Everyone's roles</h3>
      <ul className="players">
        {view.players.map((p) => (
          <li key={p.id} className={p.id === view.me?.id ? 'self' : ''}>
            <span className="pname">
              {p.name}
              {p.id === view.result?.merlinGuess && <span className="muted"> (Evil's guess)</span>}
            </span>
            <span className="badges">
              <RoleTag role={p.role} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The most recent vote and quest outcome, shown in full as at the table.
export function LastResults({ view }) {
  const v = view.lastVote;
  const q = view.lastQuest;
  if (!v && !q) return null;
  const approvals = v ? Object.values(v.votes).filter(Boolean).length : 0;
  return (
    <section className="card">
      <h3>Latest results</h3>
      {q && (
        <p className={`result-line ${q.result === 'SUCCESS' ? 'ok' : 'bad'}`}>
          Quest {q.round + 1}: <strong>{q.result === 'SUCCESS' ? 'Success' : 'Failed'}</strong> ({q.successes} Success, {q.fails} Fail)
        </p>
      )}
      {v && <VoteRecord view={view} record={v} approvals={approvals} />}
    </section>
  );
}

function VoteRecord({ view, record, approvals }) {
  return (
    <div className="vote-record">
      <p>
        Quest {record.round + 1}, proposal {record.attempt} by {nameOf(view, record.leaderId)}:{' '}
        <strong className={record.approved ? 'ok' : 'bad'}>
          {record.approved ? 'Approved' : 'Rejected'} {approvals}–{Object.keys(record.votes).length - approvals}
        </strong>
      </p>
      <p className="hint">Team: {listNames(namesOf(view, record.team))}</p>
      <div className="chips">
        {view.players
          .filter((p) => p.id in record.votes)
          .map((p) => (
            <span key={p.id} className={`chip ${record.votes[p.id] ? 'chip-yes' : 'chip-no'}`}>
              {record.votes[p.id] ? '✓' : '✗'} {p.name}
            </span>
          ))}
      </div>
    </div>
  );
}

export function VoteHistory({ view }) {
  if (view.voteHistory.length < 2) return null;
  return (
    <details className="card">
      <summary>All team votes ({view.voteHistory.length})</summary>
      {[...view.voteHistory].reverse().map((r, i) => (
        <VoteRecord key={i} view={view} record={r} approvals={Object.values(r.votes).filter(Boolean).length} />
      ))}
    </details>
  );
}

export function LobbyRules({ rules }) {
  if (!rules) return <p className="hint">Avalon needs 5 to 10 players.</p>;
  return (
    <p className="hint">
      With {rules.playerCount} players: <strong>{rules.good} Good</strong> (including Merlin) and{' '}
      <strong>{rules.evil} Evil</strong>. Quest team sizes: {rules.quests.map((q) => q.size + (q.failsNeeded > 1 ? '★' : '')).join(' · ')}
    </p>
  );
}

export function PhasePanel({ view, run, busy }) {
  switch (view.phase) {
    case 'TEAM_BUILDING':
      return <TeamPicker view={view} run={run} busy={busy} />;
    case 'TEAM_VOTE':
      return <VotePanel view={view} run={run} busy={busy} />;
    case 'QUEST':
      return <QuestPanel view={view} run={run} busy={busy} />;
    case 'MERLIN_VOTE':
      return <MerlinVotePanel view={view} run={run} busy={busy} />;
    case 'GAME_OVER':
      return <GameOverPanel view={view} />;
    default:
      return null;
  }
}
