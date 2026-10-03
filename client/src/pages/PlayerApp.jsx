import { useState } from 'react';
import { PLAYER_TOKEN, postJson, useStoredToken } from '../lib.js';
import { GameScreen } from '../components/GameScreen.jsx';

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
      <h1 className="title">Avalon</h1>
      <p className="muted center">The Resistance: Avalon. Join the table.</p>
      {notice && <div className="banner">{notice}</div>}
      <form className="card stack" onSubmit={submit}>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" autoFocus required />
        </label>
        <label>
          Game password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Joining…' : 'Join game'}
        </button>
        <p className="hint">Lost your session mid-game? Join again with the exact same name to get your seat back.</p>
      </form>
    </main>
  );
}
