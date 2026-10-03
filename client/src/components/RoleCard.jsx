import { useState } from 'react';
import { listNames, namesOf, ROLE_INFO } from '../lib.js';

// The player's secret card. Hidden until tapped so neighbours can't glance at it.
export function RoleCard({ view }) {
  const [shown, setShown] = useState(false);
  const { me } = view;
  if (!me?.role) return null;
  const info = ROLE_INFO[me.role];
  const known = listNames(namesOf(view, me.knows));

  return (
    <section className={`card role-card ${shown ? `role-${info.cls}` : 'role-hidden'}`}>
      <button type="button" className="role-toggle" onClick={() => setShown(!shown)} aria-expanded={shown}>
        <span>{shown ? 'Your secret role' : 'Tap to reveal your secret role'}</span>
        <span className="muted">{shown ? 'Hide' : 'Show'}</span>
      </button>
      {shown && (
        <div className="role-body">
          <div className="role-name">{info.label}</div>
          <div className="role-team">Team {me.role === 'EVIL' ? 'Evil' : 'Good'}</div>
          {me.role === 'GOOD' && (
            <p>You don't know anyone's role. Help Good succeed on 3 quests and watch who keeps failing them.</p>
          )}
          {me.role === 'MERLIN' && (
            <>
              <p className="knows">
                The Minions of Mordred are: <strong>{known}</strong>
              </p>
              <p>Guide Good without being obvious. If Evil identifies you at the end, Evil wins.</p>
            </>
          )}
          {me.role === 'EVIL' && (
            <>
              <p className="knows">
                {me.knows.length ? (
                  <>
                    Your fellow Minions: <strong>{known}</strong>
                  </>
                ) : (
                  'You have no fellow Minions.'
                )}
              </p>
              <p>Get onto quests and fail 3 of them. If Good wins 3 quests, your team must find Merlin.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
