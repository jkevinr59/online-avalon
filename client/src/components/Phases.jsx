import { useEffect, useState } from 'react';
import { nameOf, namesOf } from '../lib.js';
import { useI18n } from '../i18n.jsx';
import { RoleTag } from './Board.jsx';
import { Tips } from './Tips.jsx';

const questNo = (view) => view.round + 1;
const teamSize = (view) => view.quests[view.round]?.size;
// Merlin plays like a servant on quests; tips only split Good / Evil there.
const side = (role) => (role === 'EVIL' ? 'EVIL' : 'GOOD');

// One sentence telling the viewer what to do now, or who everyone waits for.
export function StatusBanner({ view }) {
  const { t, list } = useI18n();
  const { me, phase } = view;
  const waiting = list(namesOf(view, view.waitingFor));
  const leader = view.leaderId ? nameOf(view, view.leaderId) : '';
  const q = questNo(view);
  let text = '';
  let action = false;

  if (phase === 'TEAM_BUILDING') {
    action = !!me?.isLeader;
    text = action ? t('status.leaderYou', { size: teamSize(view), q }) : t('status.leaderOther', { leader, size: teamSize(view), q });
  } else if (phase === 'TEAM_VOTE') {
    action = !!me && me.myVote === null;
    text = action ? t('status.voteYou', { leader, q }) : t('status.waitingVotes', { names: waiting });
  } else if (phase === 'QUEST') {
    action = !!me?.onTeam && me.myQuestCard === null;
    text = action ? t('status.questYou', { q }) : t('status.questOther', { q, names: waiting });
  } else if (phase === 'MERLIN_VOTE') {
    action = me?.role === 'EVIL';
    text = action ? t('status.merlinEvil') : t('status.merlinGood');
  } else if (phase === 'VOTE_RESULT') {
    text = t('status.voteResult');
  } else if (phase === 'QUEST_RESULT') {
    text = t('status.questResult', { q });
  }
  if (!text) return null;
  return (
    <div className={`banner ${action ? 'banner-action' : ''}`} role="status">
      {action && <span className="banner-label">{t('common.yourTurn')}</span>}
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

// `picked` lives in the parent so closing the modal keeps the selection.
export function TeamPicker({ view, run, busy, picked, setPicked }) {
  const { t } = useI18n();
  const size = teamSize(view);
  if (!view.me?.isLeader) return null;

  const toggle = (id) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < size ? [...cur, id] : cur));

  return (
    <div className="panel">
      <h3>
        {t('pick.title')} <span className="muted">({picked.length}/{size})</span>
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
            {p.id === view.me.id ? t('common.youParen') : ''}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={picked.length !== size || busy}
        onClick={() => run('propose', { team: picked })}
      >
        {t('pick.propose')}
      </button>
      <Tips tipKey={`tips.leader.${view.me.role}`} />
    </div>
  );
}

export function VotePanel({ view, run, busy }) {
  const { t } = useI18n();
  const voted = view.players.filter((p) => p.hasVoted).length;
  const my = view.me?.myVote;
  return (
    <div className="panel">
      <h3>{t('vote.title', { leader: nameOf(view, view.leaderId), q: questNo(view) })}</h3>
      <TeamChips view={view} ids={view.proposal} />
      {view.me && (
        <>
          <div className="btn-row">
            <button type="button" className={`btn btn-approve ${my === true ? 'chosen' : ''}`} disabled={busy} onClick={() => run('vote', { approve: true })}>
              {t('vote.approve')}
            </button>
            <button type="button" className={`btn btn-reject ${my === false ? 'chosen' : ''}`} disabled={busy} onClick={() => run('vote', { approve: false })}>
              {t('vote.reject')}
            </button>
          </div>
          <p className="hint">
            {my === null ? t('vote.secret') : t('vote.youVoted', { choice: t(my ? 'vote.approve' : 'vote.reject') })}
          </p>
        </>
      )}
      <p className="hint">
        {t('vote.progress', { done: voted, total: view.players.length })}
        {view.rejectCount === 4 && <strong className="warn"> {t('vote.lastChance')}</strong>}
      </p>
      {view.me && <Tips tipKey={`tips.vote.${view.me.role}`} />}
    </div>
  );
}

export function QuestPanel({ view, run, busy }) {
  const { t } = useI18n();
  const { me } = view;
  const played = view.players.filter((p) => p.hasPlayed).length;
  const q = view.quests[view.round];
  return (
    <div className="panel">
      <h3>{t('quest.title', { q: questNo(view) })}</h3>
      <TeamChips view={view} ids={view.proposal} />
      {me?.onTeam && me.myQuestCard === null && (
        <>
          <div className="btn-row">
            <button type="button" className="btn btn-success" disabled={busy} onClick={() => run('quest', { success: true })}>
              {t('quest.success')}
            </button>
            {me.role === 'EVIL' && (
              <button type="button" className="btn btn-fail" disabled={busy} onClick={() => run('quest', { success: false })}>
                {t('quest.fail')}
              </button>
            )}
          </div>
          <p className="hint">{me.role === 'EVIL' ? t('quest.evilHint') : t('quest.goodHint')}</p>
        </>
      )}
      {me?.onTeam && me.myQuestCard !== null && (
        <p className="hint">{t('quest.played', { card: t(me.myQuestCard ? 'quest.success' : 'quest.fail') })}</p>
      )}
      <p className="hint">
        {t('quest.progress', { done: played, total: view.proposal.length })} {q?.failsNeeded > 1 ? t('quest.needs2') : t('quest.needs1')}
      </p>
      {me?.onTeam && <Tips tipKey={`tips.quest.${side(me.role)}`} />}
    </div>
  );
}

export function MerlinVotePanel({ view, run, busy }) {
  const { t, list } = useI18n();
  const mv = view.merlinVote;
  const evil = view.players.filter((p) => p.role === 'EVIL');
  const isEvil = view.me?.role === 'EVIL';
  const tally = {};
  for (const [voter, target] of Object.entries(mv.votes ?? {})) (tally[target] ??= []).push(voter);

  return (
    <div className="panel">
      <h3>{t('merlin.title')}</h3>
      <p>
        {t('merlin.unmask')} <strong>{list(evil.map((p) => p.name))}</strong>
      </p>
      {isEvil ? (
        <>
          <p className="hint">{t('merlin.lock', { n: mv.needed })}</p>
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
                {tally[id] && <span className="vote-count"> · {t('merlin.votes', { n: tally[id].length })}</span>}
              </button>
            ))}
          </div>
          {Object.keys(tally).length > 0 && (
            <ul className="tally">
              {Object.entries(tally).map(([target, voters]) => (
                <li key={target}>
                  <strong>{nameOf(view, target)}</strong>: {list(namesOf(view, voters))}
                </li>
              ))}
            </ul>
          )}
          <Tips tipKey="tips.merlin.EVIL" />
        </>
      ) : (
        <>
          <p className="hint">{t('merlin.goodHint')}</p>
          {view.me && <Tips tipKey="tips.merlin.GOOD" />}
        </>
      )}
    </div>
  );
}

// Seconds left in the result pause. The server sends the remaining time with
// every update, so phone clocks don't need to agree with the server.
function useCountdown(remainingMs) {
  const [endsAt, setEndsAt] = useState(() => Date.now() + remainingMs);
  const [, tick] = useState(0);
  useEffect(() => setEndsAt(Date.now() + remainingMs), [remainingMs]);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(i);
  }, []);
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

// The big "what just happened / what happens next" screen shown during the
// pause after every vote and quest.
export function RevealPanel({ view, onSkip, busy }) {
  const { t } = useI18n();
  const seconds = useCountdown(view.reveal.remainingMs);
  const { kind, next } = view.reveal;
  return (
    <div className="panel reveal">
      {kind === 'vote' ? <VoteReveal view={view} /> : <QuestReveal view={view} />}
      <NextUp view={view} next={next} />
      <p className="countdown">{t('reveal.countdown', { s: seconds })}</p>
      {onSkip && (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onSkip}>
          {t('reveal.skip')}
        </button>
      )}
    </div>
  );
}

function VoteReveal({ view }) {
  const { t } = useI18n();
  const v = view.lastVote;
  const yes = view.players.filter((p) => v.votes[p.id] === true);
  const no = view.players.filter((p) => v.votes[p.id] === false);
  return (
    <>
      <p className={`reveal-headline ${v.approved ? 'ok' : 'bad'}`}>{t(v.approved ? 'reveal.approved' : 'reveal.rejected')}</p>
      <p className="reveal-count">{t('reveal.count', { yes: yes.length, no: no.length })}</p>
      <p className="hint">{t('reveal.proposedBy', { leader: nameOf(view, v.leaderId), q: v.round + 1 })}</p>
      <TeamChips view={view} ids={v.team} />
      <div className="vote-split">
        <VoterColumn title={`✓ ${t('reveal.approvers')}`} players={yes} cls="chip-yes" />
        <VoterColumn title={`✗ ${t('reveal.rejecters')}`} players={no} cls="chip-no" />
      </div>
    </>
  );
}

function VoterColumn({ title, players, cls }) {
  const { t } = useI18n();
  return (
    <div>
      <h4>{title}</h4>
      <div className="chips">
        {players.length ? (
          players.map((p) => (
            <span key={p.id} className={`chip ${cls}`}>
              {p.name}
            </span>
          ))
        ) : (
          <span className="muted">{t('reveal.nobody')}</span>
        )}
      </div>
    </div>
  );
}

function QuestReveal({ view }) {
  const { t } = useI18n();
  const q = view.lastQuest;
  const ok = q.result === 'SUCCESS';
  const good = view.quests.filter((x) => x.result === 'SUCCESS').length;
  const evil = view.quests.filter((x) => x.result === 'FAIL').length;
  return (
    <>
      <p className={`reveal-headline ${ok ? 'ok' : 'bad'}`}>{t(ok ? 'reveal.questOk' : 'reveal.questFail', { q: q.round + 1 })}</p>
      <p className="reveal-count">{t('reveal.cards', { s: q.successes, f: q.fails })}</p>
      {view.quests[q.round]?.failsNeeded > 1 && <p className="hint">{t('quest.needs2')}</p>}
      <p className="hint">{t('reveal.teamWas')}</p>
      <TeamChips view={view} ids={q.team ?? []} />
      <p className="reveal-score">{t('reveal.score', { good, evil })}</p>
    </>
  );
}

function NextUp({ view, next }) {
  const { t } = useI18n();
  const me = view.me;
  if (next.type === 'end') return <div className="next-up next-bad">{t(`reveal.end.${next.reason}`)}</div>;
  if (next.type === 'merlin') return <div className="next-up">{t('reveal.merlin')}</div>;
  if (next.type === 'quest') {
    const mine = me && next.team.includes(me.id);
    return (
      <div className={`next-up ${mine ? 'next-me' : ''}`}>
        <div>{t('reveal.nextQuest')}</div>
        <TeamChips view={view} ids={next.team} />
        {mine && <strong>{t('reveal.youOnQuest')}</strong>}
      </div>
    );
  }
  const mine = me?.id === next.leaderId;
  return (
    <div className={`next-up ${mine ? 'next-me' : ''}`}>
      <div>
        {t('reveal.nextLeader')} <strong>♛ {nameOf(view, next.leaderId)}</strong>
      </div>
      {mine && <strong>{t('reveal.youLead')}</strong>}
      {view.phase === 'VOTE_RESULT' && view.rejectCount > 0 && (
        <div className="hint">
          {t('reveal.rejectCount', { n: view.rejectCount })}
          {view.rejectCount === 4 && <strong className="warn"> {t('reveal.lastReject')}</strong>}
        </div>
      )}
    </div>
  );
}

export function GameOverPanel({ view }) {
  const { t } = useI18n();
  const w = view.result?.winner;
  const title = w === 'GOOD' ? t('over.good') : w === 'EVIL' ? t('over.evil') : t('over.ended');
  return (
    <section className={`card gameover ${w === 'GOOD' ? 'won-good' : w === 'EVIL' ? 'won-evil' : ''}`}>
      <h2>{title}</h2>
      <p>{reasonText(view, t)}</p>
      <h3>{t('over.roles')}</h3>
      <ul className="players">
        {view.players.map((p) => (
          <li key={p.id} className={p.id === view.me?.id ? 'self' : ''}>
            <span className="pname">
              {p.name}
              {p.id === view.result?.merlinGuess && <span className="muted">{t('over.guess')}</span>}
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

function reasonText(view, t) {
  const r = view.result;
  if (!r) return '';
  const guess = r.merlinGuess ? nameOf(view, r.merlinGuess) : null;
  const merlin = view.players.find((p) => p.role === 'MERLIN')?.name ?? '?';
  return t(`reason.${r.reason}`, { guess, merlin });
}

// The most recent vote and quest outcome, shown in full as at the table.
export function LastResults({ view }) {
  const { t } = useI18n();
  const v = view.lastVote;
  const q = view.lastQuest;
  if (!v && !q) return null;
  const approvals = v ? Object.values(v.votes).filter(Boolean).length : 0;
  return (
    <section className="card">
      <h3>{t('results.title')}</h3>
      {q && (
        <p className={`result-line ${q.result === 'SUCCESS' ? 'ok' : 'bad'}`}>
          {t('results.quest', { q: q.round + 1 })} <strong>{t(q.result === 'SUCCESS' ? 'results.success' : 'results.failed')}</strong> (
          {t('results.counts', { s: q.successes, f: q.fails })})
        </p>
      )}
      {v && <VoteRecord view={view} record={v} approvals={approvals} />}
    </section>
  );
}

function VoteRecord({ view, record, approvals }) {
  const { t, list } = useI18n();
  return (
    <div className="vote-record">
      <p>
        {t('results.proposal', { q: record.round + 1, attempt: record.attempt, leader: nameOf(view, record.leaderId) })}{' '}
        <strong className={record.approved ? 'ok' : 'bad'}>
          {t(record.approved ? 'results.approved' : 'results.rejected')} {approvals}–{Object.keys(record.votes).length - approvals}
        </strong>
      </p>
      <p className="hint">{t('results.team', { names: list(namesOf(view, record.team)) })}</p>
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
  const { t } = useI18n();
  if (view.voteHistory.length < 2) return null;
  return (
    <details className="card">
      <summary>{t('results.history', { n: view.voteHistory.length })}</summary>
      {[...view.voteHistory].reverse().map((r, i) => (
        <VoteRecord key={i} view={view} record={r} approvals={Object.values(r.votes).filter(Boolean).length} />
      ))}
    </details>
  );
}

export function LobbyRules({ rules }) {
  const { t } = useI18n();
  if (!rules) return <p className="hint">{t('lobby.needs')}</p>;
  return (
    <p className="hint">
      {t('lobby.rules', {
        n: rules.playerCount,
        good: rules.good,
        evil: rules.evil,
        sizes: rules.quests.map((q) => q.size + (q.failsNeeded > 1 ? '★' : '')).join(' · '),
      })}
    </p>
  );
}
