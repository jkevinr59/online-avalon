// Fills seats in a RUNNING server with bot players, so you can play a real
// game from your browser with fewer people. Bots act on their own after a
// short "thinking" delay and keep playing game after game until you stop
// the script (Ctrl+C).
//
//   npm run bots                          # 4 bots against http://localhost:3000
//   npm run bots -- --count 3 --url http://192.168.1.10:3000
//
// Bots can only join while the server is in the lobby. If a game is running
// or finished, they keep retrying; press "New game" on /host and they join.
// If the host opens an empty lobby (which removes everyone), they join again.
import { io } from 'socket.io-client';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const URL = arg('url', `http://localhost:${process.env.PORT ?? 3000}`);
const COUNT = Number(arg('count', 4));
const PASSWORD = arg('password', process.env.PLAYER_PASSWORD ?? 'avalon');
const PREFIX = arg('prefix', 'Bot');
const DELAY_MS = Number(arg('delay', 1500)); // average "thinking" time per action

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

async function login(name) {
  for (;;) {
    try {
      const res = await fetch(`${URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password: PASSWORD }),
      });
      const data = await res.json();
      if (res.ok) return data.token;
      if (res.status === 401) throw new Error(`${name}: wrong player password (use --password).`);
      console.log(`${name}: ${data.error} Retrying in 3s…`);
    } catch (err) {
      if (err.message.includes('password')) throw err;
      console.log(`${name}: cannot reach ${URL} (${err.message}). Retrying in 3s…`);
    }
    await sleep(3000);
  }
}

function startBot(name, token, onKicked) {
  const socket = io(URL, { auth: { token }, transports: ['websocket'] });
  let view = null;
  let timer = null;
  let lastPhase = null;

  socket.on('connect', () => console.log(`${name}: connected`));
  socket.on('connect_error', (err) => console.log(`${name}: ${err.message}`));
  socket.on('kicked', (msg) => {
    console.log(`${name}: ${msg} Rejoining…`);
    clearTimeout(timer);
    socket.disconnect();
    onKicked();
  });
  socket.on('state', (v) => {
    view = v;
    if (v.phase !== lastPhase && v.phase === 'TEAM_BUILDING' && lastPhase === 'LOBBY') {
      console.log(`${name}: I am ${v.me.role}`);
    }
    lastPhase = v.phase;
    // Act on the newest state only, after a human-ish pause.
    clearTimeout(timer);
    timer = setTimeout(() => act(view), DELAY_MS * (0.5 + Math.random()));
  });

  const send = (type, payload = {}) =>
    new Promise((r) => socket.emit('action', { type, ...payload }, (res) => {
      if (!res?.ok) console.log(`${name}: ${type} failed: ${res?.error}`);
      r(res);
    }));

  function act(v) {
    const me = v?.me;
    if (!me) return;
    const evil = me.role === 'EVIL';
    const known = new Set(me.knows); // Merlin: all evil; Evil: fellow evil

    if (v.phase === 'TEAM_BUILDING' && me.isLeader) {
      const size = v.quests[v.round].size;
      const others = v.players.map((p) => p.id).filter((id) => id !== me.id);
      // Merlin keeps Evil out; Evil keeps its friends out (one Evil is enough).
      const trusted = me.role === 'MERLIN' || evil ? others.filter((id) => !known.has(id)) : others;
      const team = [me.id, ...shuffle(trusted), ...shuffle(others)];
      send('propose', { team: [...new Set(team)].slice(0, size) });
    } else if (v.phase === 'TEAM_VOTE' && me.myVote === null) {
      const evilOnTeam = v.proposal.some((id) => known.has(id) || (evil && id === me.id));
      let approve = Math.random() < 0.7;
      if (me.role === 'MERLIN') approve = !evilOnTeam || Math.random() < 0.2;
      if (evil) approve = evilOnTeam || Math.random() < 0.3;
      if (v.rejectCount === 4 && !evil) approve = true; // don't hand Evil the win
      send('vote', { approve });
    } else if (v.phase === 'QUEST' && me.onTeam && me.myQuestCard === null) {
      // Evil sometimes plays Success to look Good.
      send('quest', { success: !evil || Math.random() < 0.3 });
    } else if (v.phase === 'MERLIN_VOTE' && evil) {
      const counts = {};
      for (const t of Object.values(v.merlinVote.votes ?? {})) counts[t] = (counts[t] ?? 0) + 1;
      const leading = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      const target = leading ?? pick(v.merlinVote.candidates);
      if (v.merlinVote.myVote !== target) send('merlinVote', { target });
    }
  }

  return socket;
}

const sockets = new Map(); // name -> current socket

async function join(name) {
  const token = await login(name);
  sockets.set(name, startBot(name, token, () => join(name)));
}

console.log(`Starting ${COUNT} bots against ${URL}`);
for (let i = 1; i <= COUNT; i++) await join(`${PREFIX} ${i}`);
console.log('All bots joined. Start the game from /host. Ctrl+C to stop.');

process.on('SIGINT', () => {
  for (const s of sockets.values()) s.disconnect();
  process.exit();
});
