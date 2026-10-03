import { useState } from 'react';
import { HOST_TOKEN, PLAYER_TOKEN, postJson, useActions, useGame, useStoredToken } from '../lib.js';
import { Board, PlayerList } from '../components/Board.jsx';
import { ConnectionBar, GameScreen, Toast } from '../components/GameScreen.jsx';
import { GameOverPanel, LastResults, LobbyRules, StatusBanner, VoteHistory } from '../components/Phases.jsx';

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
      <h1 className="title">Avalon Host</h1>
      {notice && <div className="banner">{notice}</div>}
      <form className="card stack" onSubmit={submit}>
        <label>
          Host password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary">Log in as host</button>
      </form>
    </main>
  );
}

function HostDashboard({ token, onExit }) {
  const { view, connected, act } = useGame(token, onExit);
  const { run, error, busy, clearError } = useActions(act);
  const [playerToken, setPlayerToken] = useStoredToken(PLAYER_TOKEN);
  const [tab, setTab] = useState('host');

  if (!view) return <div className="loading">{connected ? 'Loading…' : 'Connecting…'}</div>;

  const playing = !!playerToken;
  return (
    <main className="page">
      <ConnectionBar connected={connected} />
      <header className="topbar">
        <div>
          <div className="brand">Avalon Host</div>
          <div className="muted small">Players join at {window.location.origin}</div>
        </div>
        <button type="button" className="btn-mini" onClick={() => window.confirm('Log out of the host dashboard?') && onExit('')}>
          Log out
        </button>
      </header>

      {playing && (
        <nav className="tabs">
          <button type="button" className={tab === 'host' ? 'active' : ''} onClick={() => setTab('host')}>
            Host controls
          </button>
          <button type="button" className={tab === 'play' ? 'active' : ''} onClick={() => setTab('play')}>
            My game
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
        <HostControls view={view} run={run} busy={busy} playing={playing} onJoined={(t) => { setPlayerToken(t); setTab('play'); }} />
      </div>
      <Toast message={error} onClose={clearError} />
    </main>
  );
}

function HostControls({ view, run, busy, playing, onJoined }) {
  const n = view.players.length;
  const canStart = n >= 5 && n <= 10;

  const kick = (p) => window.confirm(`Remove ${p.name} from the lobby?`) && run('kick', { playerId: p.id });
  const abort = () => window.confirm('End the current game for everyone? Roles will be revealed.') && run('abort');

  if (view.phase === 'LOBBY') {
    return (
      <>
        <section className="card stack">
          <h3>Lobby</h3>
          <LobbyRules rules={view.lobbyRules} />
          <button type="button" className="btn btn-primary" disabled={!canStart || busy} onClick={() => run('start')}>
            Start game with {n} player{n === 1 ? '' : 's'}
          </button>
          {!canStart && <p className="hint">{n < 5 ? `Waiting for ${5 - n} more player${5 - n === 1 ? '' : 's'}.` : 'Too many players (max 10).'}</p>}
        </section>
        {!playing && <JoinAsPlayer run={run} busy={busy} onJoined={onJoined} />}
        <PlayerList view={view} title="Joined players" onKick={kick} />
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
            New game with the same players
          </button>
        </>
      ) : (
        <StatusBanner view={view} />
      )}
      <Board view={view} />
      <LastResults view={view} />
      {view.phase !== 'GAME_OVER' && <PlayerList view={view} />}
      <VoteHistory view={view} />
      {view.phase !== 'GAME_OVER' && (
        <section className="card stack">
          <h3>Danger zone</h3>
          <button type="button" className="btn btn-reject" disabled={busy} onClick={abort}>
            End game now
          </button>
        </section>
      )}
      <RecentGames games={view.admin?.recentGames} />
    </>
  );
}

function JoinAsPlayer({ run, busy, onJoined }) {
  const [name, setName] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const res = await run('joinAsPlayer', { name });
    if (res?.ok) onJoined(res.token);
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h3>Play as well?</h3>
      <div className="inline-form">
        <input placeholder="Your player name" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required />
        <button className="btn btn-secondary" disabled={busy}>
          Join
        </button>
      </div>
      <p className="hint">The host dashboard never shows secret roles, so you can play fairly.</p>
    </form>
  );
}

function RulesTable({ rules }) {
  if (!rules) return null;
  return (
    <details className="card">
      <summary>Rules by player count</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Players</th>
              <th>Good</th>
              <th>Evil</th>
              {[1, 2, 3, 4, 5].map((i) => (
                <th key={i}>Q{i}</th>
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
      <p className="hint">★ needs 2 Fail cards to fail.</p>
    </details>
  );
}

const REASONS = {
  '5_rejections': '5 rejections',
  '3_quests_failed': '3 quests failed',
  merlin_found: 'Merlin found',
  merlin_safe: 'Merlin safe',
  aborted: 'Ended by host',
};

function RecentGames({ games }) {
  if (!games?.length) return null;
  return (
    <details className="card">
      <summary>Recent games ({games.length})</summary>
      <ul className="history">
        {games.map((g) => (
          <li key={g.id}>
            <div>
              <strong>{g.winner === 'GOOD' ? 'Good won' : g.winner === 'EVIL' ? 'Evil won' : g.ended_at ? 'No winner' : 'In progress'}</strong>
              {g.reason && <span className="muted"> · {REASONS[g.reason] ?? g.reason}</span>}
              <span className="muted"> · {new Date(g.started_at).toLocaleString()}</span>
            </div>
            <div className="hint">{g.players}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}
