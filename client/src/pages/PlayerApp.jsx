import { useState } from 'react';
import { PLAYER_TOKEN, postJson, useStoredToken } from '../lib.js';
import { GameScreen } from '../components/GameScreen.jsx';
import { LangSwitch } from '../components/Modal.jsx';
import { useI18n } from '../i18n.jsx';

export function PlayerApp() {
  const [token, setToken] = useStoredToken(PLAYER_TOKEN);
  const [notice, setNotice] = useState('');

  if (!token) return <PlayerLogin notice={notice} onLogin={setToken} />;
  return (
    <main className="page">
      <GameScreen
        token={token}
        onExit={(msg) => {
          setNotice(msg || '');
          setToken(null);
        }}
      />
    </main>
  );
}

function PlayerLogin({ notice, onLogin }) {
  const { t, tError } = useI18n();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token } = await postJson('/api/login', { name, password });
      onLogin(token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page narrow">
      <div className="corner">
        <LangSwitch />
      </div>
      <h1 className="title">Avalon</h1>
      <p className="muted center">{t('login.subtitle')}</p>
      {notice && <div className="banner">{tError(notice)}</div>}
      <form className="card stack" onSubmit={submit}>
        <label>
          {t('login.name')}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" autoFocus required />
        </label>
        <label>
          {t('login.password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{tError(error)}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {t(busy ? 'login.joining' : 'login.join')}
        </button>
        <p className="hint">{t('login.rejoinHint')}</p>
      </form>
    </main>
  );
}
