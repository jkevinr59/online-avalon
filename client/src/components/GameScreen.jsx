import { useActions, useGame } from '../lib.js';
import { Board, PlayerList } from './Board.jsx';
import { RoleCard } from './RoleCard.jsx';
import { LastResults, LobbyRules, PhasePanel, StatusBanner, VoteHistory } from './Phases.jsx';

export function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="toast" role="alert" onClick={onClose}>
      {message}
    </div>
  );
}

export function ConnectionBar({ connected }) {
  if (connected) return null;
  return <div className="offline-bar">Connection lost. Reconnecting…</div>;
}

// The full player experience for one player token. Also embedded in the host
// page when the host plays.
export function GameScreen({ token, onExit, embedded = false }) {
  const { view, connected, act } = useGame(token, onExit);
  const { run, error, busy, clearError } = useActions(act);

  if (!view?.me) return <div className="loading">{connected ? 'Loading…' : 'Connecting…'}</div>;
  const { me } = view;

  const leave = async () => {
    if (!window.confirm('Leave the lobby?')) return;
    const res = await run('leave');
    if (res?.ok) onExit('');
  };

  return (
    <div className="stack">
      <ConnectionBar connected={connected} />
      {!embedded && (
        <header className="topbar">
          <div>
            <div className="brand">Avalon</div>
            <div className="muted small">Playing as {me.name}</div>
          </div>
          {view.phase === 'LOBBY' && (
            <button type="button" className="btn-mini" onClick={leave}>
              Leave
            </button>
          )}
        </header>
      )}

      {view.phase === 'LOBBY' ? (
        <>
          <div className="banner">You're in! Waiting for the host to start the game.</div>
          <section className="card">
            <LobbyRules rules={view.lobbyRules} />
          </section>
          <PlayerList view={view} title="In the lobby" selfId={me.id} />
        </>
      ) : (
        <>
          <RoleCard view={view} />
          <StatusBanner view={view} />
          <PhasePanel view={view} run={run} busy={busy} />
          {view.phase === 'GAME_OVER' && <div className="banner">Waiting for the host to start a new game.</div>}
          <Board view={view} />
          <LastResults view={view} />
          {view.phase !== 'GAME_OVER' && <PlayerList view={view} selfId={me.id} knownEvil={me.knows} />}
          <VoteHistory view={view} />
        </>
      )}
      <Toast message={error} onClose={clearError} />
    </div>
  );
}
