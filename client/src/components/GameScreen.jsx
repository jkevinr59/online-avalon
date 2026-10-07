import { useEffect, useState } from 'react';
import { SEEN_ROLE, useActions, useGame, useStoredToken } from '../lib.js';
import { useI18n } from '../i18n.jsx';
import { Board, PlayerList } from './Board.jsx';
import { RoleCard, RoleReveal } from './RoleCard.jsx';
import { LangSwitch, Modal } from './Modal.jsx';
import { HelpModal } from './Tips.jsx';
import {
  GameOverPanel,
  LastResults,
  LobbyRules,
  MerlinVotePanel,
  QuestPanel,
  RevealPanel,
  StatusBanner,
  TeamPicker,
  VoteHistory,
  VotePanel,
} from './Phases.jsx';

export function Toast({ message, onClose }) {
  const { tError } = useI18n();
  if (!message) return null;
  return (
    <div className="toast" role="alert" onClick={onClose}>
      {tError(message)}
    </div>
  );
}

export function ConnectionBar({ connected }) {
  const { t } = useI18n();
  if (connected) return null;
  return <div className="offline-bar">{t('common.offline')}</div>;
}

// Which pop-up this player has for the current phase, if any. Everything a
// player has to do (and every result pause) happens in a modal.
function modalFor(view) {
  const { me, phase } = view;
  if (phase === 'TEAM_BUILDING' && me.isLeader) return 'pick';
  if (phase === 'TEAM_VOTE') return 'vote';
  if (phase === 'QUEST' && me.onTeam) return 'quest';
  if (phase === 'MERLIN_VOTE' && me.role === 'EVIL') return 'merlin';
  if (phase === 'VOTE_RESULT' || phase === 'QUEST_RESULT') return 'result';
  return null;
}

// The full player experience for one player token. Also embedded in the host
// page when the host plays.
export function GameScreen({ token, onExit, embedded = false }) {
  const { t } = useI18n();
  const { view, connected, act } = useGame(token, onExit);
  const { run, error, busy, clearError } = useActions(act);
  const [seenRole, setSeenRole] = useStoredToken(SEEN_ROLE);
  const [dismissed, setDismissed] = useState(null);
  const [help, setHelp] = useState(false);
  const [picked, setPicked] = useState([]);

  // A new proposal (or game) starts the leader's pick from scratch.
  const proposalKey = view ? `${view.gameId}:${view.round}:${view.voteHistory.length}` : '';
  useEffect(() => setPicked([]), [proposalKey]);

  if (!view?.me) return <div className="loading">{t(connected ? 'common.loading' : 'common.connecting')}</div>;
  const { me, phase } = view;

  const leave = async () => {
    if (!window.confirm(t('game.leaveConfirm'))) return;
    const res = await run('leave');
    if (res?.ok) onExit('');
  };

  const roleKey = `${view.gameId}:${me.id}`;
  const revealingRole = phase !== 'LOBBY' && phase !== 'GAME_OVER' && seenRole !== roleKey;
  const kind = phase === 'LOBBY' ? null : modalFor(view);
  // Each phase step has its own key, so a closed pop-up stays closed only
  // until the next step starts.
  const modalKey = `${view.gameId}:${phase}:${view.round}:${view.voteHistory.length}`;
  const modalOpen = !!kind && dismissed !== modalKey && !revealingRole && !help;
  const closeModal = () => setDismissed(modalKey);

  const panel = {
    pick: <TeamPicker view={view} run={run} busy={busy} picked={picked} setPicked={setPicked} />,
    vote: <VotePanel view={view} run={run} busy={busy} />,
    quest: <QuestPanel view={view} run={run} busy={busy} />,
    merlin: <MerlinVotePanel view={view} run={run} busy={busy} />,
    result: view.reveal && <RevealPanel view={view} />,
  }[kind];
  const modalTitle = kind === 'result' ? t(view.reveal?.kind === 'quest' ? 'reveal.questTitle' : 'reveal.voteTitle') : kind && t(`modal.${kind}`);
  const tone = kind === 'result' ? 'modal-result' : 'modal-action';

  // Shown on the page when there is nothing for this player to do in a modal.
  let inline = null;
  if (phase === 'QUEST' && !me.onTeam) inline = <QuestPanel view={view} run={run} busy={busy} />;
  if (phase === 'MERLIN_VOTE' && me.role !== 'EVIL') inline = <MerlinVotePanel view={view} run={run} busy={busy} />;

  return (
    <div className="stack">
      <ConnectionBar connected={connected} />
      {!embedded ? (
        <header className="topbar">
          <div>
            <div className="brand">Avalon</div>
            <div className="muted small">{t('game.playingAs', { name: me.name })}</div>
          </div>
          <div className="topbar-actions">
            <button type="button" className="btn-mini" onClick={() => setHelp(true)}>
              ❓ {t('game.help')}
            </button>
            <LangSwitch />
            {phase === 'LOBBY' && (
              <button type="button" className="btn-mini" onClick={leave}>
                {t('game.leave')}
              </button>
            )}
          </div>
        </header>
      ) : (
        <div className="topbar-actions end">
          <button type="button" className="btn-mini" onClick={() => setHelp(true)}>
            ❓ {t('game.help')}
          </button>
        </div>
      )}

      {phase === 'LOBBY' ? (
        <>
          <div className="banner">{t('game.lobbyWaiting')}</div>
          <section className="card">
            <LobbyRules rules={view.lobbyRules} />
          </section>
          <PlayerList view={view} title={t('game.inLobby')} selfId={me.id} />
        </>
      ) : revealingRole ? (
        <RoleReveal view={view} onDone={() => setSeenRole(roleKey)} />
      ) : (
        <>
          <RoleCard view={view} />
          <StatusBanner view={view} />
          {inline && <section className="card">{inline}</section>}
          {phase === 'GAME_OVER' && (
            <>
              <GameOverPanel view={view} />
              <div className="banner">{t('game.waitingNewGame')}</div>
            </>
          )}
          <Board view={view} />
          <LastResults view={view} />
          {phase !== 'GAME_OVER' && <PlayerList view={view} selfId={me.id} knownEvil={me.knows} />}
          <VoteHistory view={view} />
          {kind && !modalOpen && (
            <button type="button" className={`fab ${kind === 'result' ? 'fab-result' : ''}`} onClick={() => setDismissed(null)}>
              {t(`turn.${kind}`)}
            </button>
          )}
        </>
      )}

      {modalOpen && panel && (
        <Modal title={modalTitle} onClose={closeModal} tone={tone}>
          {panel}
        </Modal>
      )}
      {help && <HelpModal onClose={() => setHelp(false)} />}
      <Toast message={error} onClose={clearError} />
    </div>
  );
}
