import { useState } from 'react';
import { namesOf, ROLE_CLS } from '../lib.js';
import { useI18n } from '../i18n.jsx';
import { Tips } from './Tips.jsx';

// Who this player knows about, plus their goal in one sentence.
function RoleKnowledge({ view }) {
  const { t, list } = useI18n();
  const { me } = view;
  const known = list(namesOf(view, me.knows));
  return (
    <>
      {me.role === 'MERLIN' && (
        <p className="knows">
          {t('role.knowsMerlin')} <strong>{known}</strong>
        </p>
      )}
      {me.role === 'EVIL' && (
        <p className="knows">
          {me.knows.length ? (
            <>
              {t('role.knowsEvil')} <strong>{known}</strong>
            </>
          ) : (
            t('role.noFellows')
          )}
        </p>
      )}
      <p>{t(`role.goal.${me.role}`)}</p>
    </>
  );
}

const teamOf = (role) => (role === 'EVIL' ? 'role.teamEvil' : 'role.teamGood');

// Full-page role reveal at the start of every game, before the game screen:
// first a privacy check, then the role, what it knows, and how to play it.
export function RoleReveal({ view, onDone }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const role = view.me.role;

  if (!shown) {
    return (
      <section className="reveal-page">
        <div className="reveal-icon" aria-hidden="true">
          🛡️
        </div>
        <h1>{t('roleReveal.started')}</h1>
        <p className="muted">{t('roleReveal.private')}</p>
        <button type="button" className="btn btn-primary" onClick={() => setShown(true)}>
          {t('roleReveal.show')}
        </button>
      </section>
    );
  }

  return (
    <section className={`reveal-page role-${ROLE_CLS[role]}`}>
      <p className="muted">{t('roleReveal.youAre')}</p>
      <div className="role-name big">{t(`role.${role}.label`)}</div>
      <div className="role-team">{t(teamOf(role))}</div>
      <div className="reveal-knowledge">
        <RoleKnowledge view={view} />
      </div>
      <Tips tipKey={`tips.role.${role}`} title={t('roleReveal.tipsTitle')} always />
      <button type="button" className="btn btn-primary" onClick={onDone}>
        {t('roleReveal.done')}
      </button>
    </section>
  );
}

// The player's secret card during the game. Hidden until tapped so
// neighbours can't glance at it.
export function RoleCard({ view }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const { me } = view;
  if (!me?.role) return null;

  return (
    <section className={`card role-card ${shown ? `role-${ROLE_CLS[me.role]}` : 'role-hidden'}`}>
      <button type="button" className="role-toggle" onClick={() => setShown(!shown)} aria-expanded={shown}>
        <span>{t(shown ? 'roleCard.yourRole' : 'roleCard.tapToShow')}</span>
        <span className="muted">{t(shown ? 'roleCard.hide' : 'roleCard.show')}</span>
      </button>
      {shown && (
        <div className="role-body">
          <div className="role-name">{t(`role.${me.role}.label`)}</div>
          <div className="role-team">{t(teamOf(me.role))}</div>
          <RoleKnowledge view={view} />
          <Tips tipKey={`tips.role.${me.role}`} />
        </div>
      )}
    </section>
  );
}
