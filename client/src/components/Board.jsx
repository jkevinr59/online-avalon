import { nameOf, ROLE_INFO } from '../lib.js';

// Public table state: quest track, reject counter, leader.
export function Board({ view }) {
  const live = view.phase !== 'LOBBY' && view.phase !== 'GAME_OVER';
  const hasDoubleFail = view.quests.some((q) => q.failsNeeded > 1);
  return (
    <section className="card board" aria-label="Quest board">
      <div className="quests">
        {view.quests.map((q, i) => {
          const state = q.result ? q.result.toLowerCase() : i === view.round && live ? 'current' : '';
          return (
            <div key={i} className={`quest ${state}`} title={q.result ? `${q.successes} success, ${q.fails} fail` : `${q.size} players`}>
              <span className="quest-mark">{q.result === 'SUCCESS' ? '✓' : q.result === 'FAIL' ? '✗' : q.size}</span>
              <span className="quest-label">
                Q{i + 1}
                {q.failsNeeded > 1 && <span className="star">★</span>}
              </span>
            </div>
          );
        })}
      </div>
      {hasDoubleFail && <p className="hint center">★ Quest 4 needs 2 Fail cards to fail</p>}
      <div className="board-row">
        <span className="muted">Rejected teams in a row</span>
        <span className="pips" aria-label={`${view.rejectCount} of 5`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`pip ${i < view.rejectCount ? 'on' : ''} ${i === 4 ? 'last' : ''}`} />
          ))}
        </span>
      </div>
      {view.leaderId && (
        <div className="board-row">
          <span className="muted">Leader</span>
          <strong>♛ {nameOf(view, view.leaderId)}</strong>
        </div>
      )}
    </section>
  );
}

export function RoleTag({ role }) {
  if (!role) return null;
  return <span className={`tag tag-${ROLE_INFO[role].cls}`}>{ROLE_INFO[role].short}</span>;
}

// Everyone at the table, with public markers. `knownEvil` highlights what the
// viewer privately knows (Merlin / Evil), `onKick` adds host controls.
export function PlayerList({ view, title = 'Players', knownEvil = [], onKick, selfId }) {
  return (
    <section className="card">
      <h3>
        {title} <span className="muted">({view.players.length})</span>
      </h3>
      <ul className="players">
        {view.players.map((p) => {
          const knownAsEvil = !p.role && knownEvil.includes(p.id);
          return (
            <li key={p.id} className={p.id === selfId ? 'self' : ''}>
              <span className={`dot ${p.online ? 'on' : ''}`} title={p.online ? 'Online' : 'Offline'} />
              <span className="pname">
                {p.name}
                {p.id === selfId && <span className="muted"> (you)</span>}
              </span>
              <span className="badges">
                {p.isLeader && <span className="tag tag-leader">♛ Leader</span>}
                {p.onTeam && <span className="tag tag-team">On team</span>}
                {view.phase === 'TEAM_VOTE' && <span className={`tag ${p.hasVoted ? 'tag-done' : 'tag-wait'}`}>{p.hasVoted ? 'Voted' : 'Voting…'}</span>}
                {view.phase === 'QUEST' && p.onTeam && (
                  <span className={`tag ${p.hasPlayed ? 'tag-done' : 'tag-wait'}`}>{p.hasPlayed ? 'Played' : 'Playing…'}</span>
                )}
                {knownAsEvil && <span className="tag tag-evil">Evil (you know)</span>}
                <RoleTag role={p.role} />
                {onKick && (
                  <button type="button" className="btn-mini" onClick={() => onKick(p)}>
                    Kick
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
