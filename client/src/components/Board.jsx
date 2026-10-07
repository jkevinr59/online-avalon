import { nameOf, ROLE_CLS } from '../lib.js';
import { useI18n } from '../i18n.jsx';

// Public table state: quest track, reject counter, leader.
export function Board({ view }) {
  const { t } = useI18n();
  const live = view.phase !== 'LOBBY' && view.phase !== 'GAME_OVER';
  const hasDoubleFail = view.quests.some((q) => q.failsNeeded > 1);
  return (
    <section className="card board" aria-label={t('board.label')}>
      <div className="quests">
        {view.quests.map((q, i) => {
          const state = q.result ? q.result.toLowerCase() : i === view.round && live ? 'current' : '';
          return (
            <div key={i} className={`quest ${state}`} title={q.result ? t('board.questDone', { s: q.successes, f: q.fails }) : t('board.questSize', { n: q.size })}>
              <span className="quest-mark">{q.result === 'SUCCESS' ? '✓' : q.result === 'FAIL' ? '✗' : q.size}</span>
              <span className="quest-label">
                {t('board.q', { n: i + 1 })}
                {q.failsNeeded > 1 && <span className="star">★</span>}
              </span>
            </div>
          );
        })}
      </div>
      {hasDoubleFail && <p className="hint center">{t('board.doubleFail')}</p>}
      <div className="board-row">
        <span className="muted">{t('board.rejects')}</span>
        <span className="pips" aria-label={t('board.rejectsOf', { n: view.rejectCount })}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`pip ${i < view.rejectCount ? 'on' : ''} ${i === 4 ? 'last' : ''}`} />
          ))}
        </span>
      </div>
      {view.leaderId && (
        <div className="board-row">
          <span className="muted">{t('board.leader')}</span>
          <strong>♛ {nameOf(view, view.leaderId)}</strong>
        </div>
      )}
    </section>
  );
}

export function RoleTag({ role }) {
  const { t } = useI18n();
  if (!role) return null;
  return <span className={`tag tag-${ROLE_CLS[role]}`}>{t(`role.${role}.short`)}</span>;
}

// Everyone at the table, with public markers. `knownEvil` highlights what the
// viewer privately knows (Merlin / Evil), `onKick` adds host controls.
export function PlayerList({ view, title, knownEvil = [], onKick, selfId }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h3>
        {title ?? t('players.title')} <span className="muted">({view.players.length})</span>
      </h3>
      <ul className="players">
        {view.players.map((p) => {
          const knownAsEvil = !p.role && knownEvil.includes(p.id);
          return (
            <li key={p.id} className={p.id === selfId ? 'self' : ''}>
              <span className={`dot ${p.online ? 'on' : ''}`} title={t(p.online ? 'players.online' : 'players.offline')} />
              <span className="pname">
                {p.name}
                {p.id === selfId && <span className="muted">{t('common.youParen')}</span>}
              </span>
              <span className="badges">
                {p.isLeader && <span className="tag tag-leader">{t('players.leader')}</span>}
                {p.onTeam && <span className="tag tag-team">{t('players.onTeam')}</span>}
                {view.phase === 'TEAM_VOTE' && (
                  <span className={`tag ${p.hasVoted ? 'tag-done' : 'tag-wait'}`}>{t(p.hasVoted ? 'players.voted' : 'players.voting')}</span>
                )}
                {view.phase === 'QUEST' && p.onTeam && (
                  <span className={`tag ${p.hasPlayed ? 'tag-done' : 'tag-wait'}`}>{t(p.hasPlayed ? 'players.played' : 'players.playing')}</span>
                )}
                {knownAsEvil && <span className="tag tag-evil">{t('players.knownEvil')}</span>}
                <RoleTag role={p.role} />
                {onKick && (
                  <button type="button" className="btn-mini" onClick={() => onKick(p)}>
                    {t('players.kick')}
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
