import { useState } from 'react';
import { HOST_TOKEN, PLAYER_TOKEN, postJson, useActions, useGame, useStoredToken } from '../lib.js';
import { Board, PlayerList } from '../components/Board.jsx';
import { ConnectionBar, GameScreen, Toast } from '../components/GameScreen.jsx';
import { GameOverPanel, LastResults, LobbyRules, RevealPanel, StatusBanner, VoteHistory } from '../components/Phases.jsx';
import { LangSwitch } from '../components/Modal.jsx';
import { HelpModal } from '../components/Tips.jsx';
import { useI18n } from '../i18n.jsx';

export function HostApp() {
  const [hostToken, setHostToken] = useStoredToken(HOST_TOKEN);
  const [notice, setNotice] = useState('');
  if (!hostToken) return <HostLogin notice={notice} onLogin={setHostToken} />;
  return (
    <HostDashboard
      token={hostToken}
      onExit={(msg) => {
        setNotice(msg || '');
        setHostToken(null);
      }}
    />
  );
}

function HostLogin({ notice, onLogin }) {
  const { t, tError } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      onLogin((await postJson('/api/host-login', { password })).token);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <main className="page narrow">
      <div className="corner">
        <LangSwitch />
      </div>
      <h1 className="title">{t('host.title')}</h1>
      {notice && <div className="banner">{tError(notice)}</div>}
      <form className="card stack" onSubmit={submit}>
        <label>
          {t('login.hostPassword')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
        </label>
        {error && <p className="error">{tError(error)}</p>}
        <button className="btn btn-primary">{t('login.hostSubmit')}</button>
      </form>
    </main>
  );
}

function HostDashboard({ token, onExit }) {
  const { t } = useI18n();
  const { view, connected, act } = useGame(token, onExit);
  const { run, error, busy, clearError } = useActions(act);
  const [playerToken, setPlayerToken] = useStoredToken(PLAYER_TOKEN);
  const [tab, setTab] = useState('host');
  const [help, setHelp] = useState(false);

  if (!view) return <div className="loading">{t(connected ? 'common.loading' : 'common.connecting')}</div>;

  const playing = !!playerToken;
  return (
    <main className="page">
      <ConnectionBar connected={connected} />
      <header className="topbar">
        <div>
          <div className="brand">{t('host.title')}</div>
          <div className="muted small">{t('host.joinAt', { url: window.location.origin })}</div>
        </div>
        <div className="topbar-actions">
          <button type="button" className="btn-mini" onClick={() => setHelp(true)}>
            ❓ {t('game.help')}
          </button>
          <LangSwitch />
          <button type="button" className="btn-mini" onClick={() => window.confirm(t('host.logoutConfirm')) && onExit('')}>
            {t('host.logout')}
          </button>
        </div>
      </header>

      {playing && (
        <nav className="tabs">
          <button type="button" className={tab === 'host' ? 'active' : ''} onClick={() => setTab('host')}>
            {t('host.tabHost')}
          </button>
          <button type="button" className={tab === 'play' ? 'active' : ''} onClick={() => setTab('play')}>
            {t('host.tabPlay')}
          </button>
        </nav>
      )}

      {/* The player screen stays mounted so its socket keeps the host "online". */}
      {playing && (
        <div hidden={tab !== 'play'}>
          <GameScreen token={playerToken} embedded onExit={() => setPlayerToken(null)} />
        </div>
      )}
      <div hidden={playing && tab !== 'host'} className="stack">
        <HostControls view={view} run={run} busy={busy} playing={playing} onJoined={(tk) => { setPlayerToken(tk); setTab('play'); }} />
      </div>
      {help && <HelpModal onClose={() => setHelp(false)} />}
      <Toast message={error} onClose={clearError} />
    </main>
  );
}

function HostControls({ view, run, busy, playing, onJoined }) {
  const { t } = useI18n();
  const n = view.players.length;
  const canStart = n >= 5 && n <= 10;

  const kick = (p) => window.confirm(t('host.kickConfirm', { name: p.name })) && run('kick', { playerId: p.id });
  const abort = () => window.confirm(t('host.abortConfirm')) && run('abort');

  if (view.phase === 'LOBBY') {
    return (
      <>
        <section className="card stack">
          <h3>{t('host.lobby')}</h3>
          <LobbyRules rules={view.lobbyRules} />
          <button type="button" className="btn btn-primary" disabled={!canStart || busy} onClick={() => run('start')}>
            {t('host.start', { n })}
          </button>
          {!canStart && <p className="hint">{n < 5 ? t('host.needMore', { n: 5 - n }) : t('host.tooMany')}</p>}
        </section>
        {!playing && <JoinAsPlayer run={run} busy={busy} onJoined={onJoined} />}
        <PlayerList view={view} title={t('host.joined')} onKick={kick} />
        <RulesTable rules={view.admin?.allRules} />
        <RecentGames games={view.admin?.recentGames} />
      </>
    );
  }

  return (
    <>
      {view.phase === 'GAME_OVER' ? (
        <>
          <GameOverPanel view={view} />
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run('reset')}>
            {t('host.newGame')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => window.confirm(t('host.newEmptyConfirm')) && run('reset', { empty: true })}
          >
            {t('host.newEmpty')}
          </button>
        </>
      ) : (
        <StatusBanner view={view} />
      )}
      {view.reveal && (
        <section className="card">
          <RevealPanel view={view} busy={busy} onSkip={() => run('continue')} />
        </section>
      )}
      <Board view={view} />
      <LastResults view={view} />
      {view.phase !== 'GAME_OVER' && <PlayerList view={view} />}
      <VoteHistory view={view} />
      {view.phase !== 'GAME_OVER' && (
        <section className="card stack">
          <h3>{t('host.danger')}</h3>
          <button type="button" className="btn btn-reject" disabled={busy} onClick={abort}>
            {t('host.endNow')}
          </button>
        </section>
      )}
      <RecentGames games={view.admin?.recentGames} />
    </>
  );
}

function JoinAsPlayer({ run, busy, onJoined }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const res = await run('joinAsPlayer', { name });
    if (res?.ok) onJoined(res.token);
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h3>{t('host.playToo')}</h3>
      <div className="inline-form">
        <input placeholder={t('host.playerName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required />
        <button className="btn btn-secondary" disabled={busy}>
          {t('host.join')}
        </button>
      </div>
      <p className="hint">{t('host.fairHint')}</p>
    </form>
  );
}

function RulesTable({ rules }) {
  const { t } = useI18n();
  if (!rules) return null;
  return (
    <details className="card">
      <summary>{t('host.rulesTitle')}</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('host.colPlayers')}</th>
              <th>{t('host.colGood')}</th>
              <th>{t('host.colEvil')}</th>
              {[1, 2, 3, 4, 5].map((i) => (
                <th key={i}>{t('host.colQ', { n: i })}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.playerCount}>
                <td>{r.playerCount}</td>
                <td>{r.good}</td>
                <td>{r.evil}</td>
                {r.quests.map((q, i) => (
                  <td key={i}>
                    {q.size}
                    {q.failsNeeded > 1 ? '★' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">{t('host.star')}</p>
    </details>
  );
}

function RecentGames({ games }) {
  const { t, lang } = useI18n();
  if (!games?.length) return null;
  return (
    <details className="card">
      <summary>{t('host.recent', { n: games.length })}</summary>
      <ul className="history">
        {games.map((g) => (
          <li key={g.id}>
            <div>
              <strong>{t(g.winner === 'GOOD' ? 'host.goodWon' : g.winner === 'EVIL' ? 'host.evilWon' : g.ended_at ? 'host.noWinner' : 'host.inProgress')}</strong>
              {g.reason && <span className="muted"> · {t(`host.reasons.${g.reason}`)}</span>}
              <span className="muted"> · {new Date(g.started_at).toLocaleString(lang)}</span>
            </div>
            <div className="hint">{g.players}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}
