// End-to-end check: boots the real server on a random port with an in-memory
// DB, logs in a host and N bot players over HTTP + Socket.IO, and lets the
// bots play several full games with random (but legal) choices.
//
//   node scripts/simulate.js --players 7 --games 5
import { io } from 'socket.io-client';
import { startServer } from '../server/index.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};
const PLAYERS = arg('players', 7);
const GAMES = arg('games', 5);
const REASONS = ['5_rejections', '3_quests_failed', 'merlin_found', 'merlin_safe'];

const app = await startServer({ port: 0, dbPath: ':memory:', playerPassword: 'pw', hostPassword: 'hpw' });
const base = `http://localhost:${app.port}`;

async function post(path, body) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error}`);
  return data;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(base, { auth: { token }, transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}
const send = (socket, type, payload = {}) => new Promise((r) => socket.emit('action', { type, ...payload }, r));

// Login checks.
await post('/api/login', { name: 'x', password: 'wrong' }).then(
  () => { throw new Error('wrong password accepted'); },
  () => {},
);

const host = await connect((await post('/api/host-login', { password: 'hpw' })).token);
const bots = [];
for (let i = 1; i <= PLAYERS; i++) {
  const { token } = await post('/api/login', { name: `Bot ${i}`, password: 'pw' });
  const socket = await connect(token);
  const bot = { name: `Bot ${i}`, socket, view: null };
  socket.on('state', (v) => {
    bot.view = v;
    act(bot);
  });
  bots.push(bot);
}

// A connected name cannot be stolen.
await post('/api/login', { name: 'bot 1', password: 'pw' }).then(
  () => { throw new Error('connected name was taken over'); },
  () => {},
);

let hostView = null;
let finished = [];
let resolveGame;
host.on('state', (v) => {
  hostView = v;
  if (v.phase === 'GAME_OVER' && resolveGame) {
    const r = resolveGame;
    resolveGame = null;
    r(v);
  }
});

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function checkLeaks(bot, v) {
  const unmasked = v.phase === 'MERLIN_VOTE' || v.phase === 'GAME_OVER';
  if (unmasked) return;
  for (const p of v.players) if (p.role) throw new Error(`${bot.name} saw ${p.name}'s role during ${v.phase}`);
}

function act(bot) {
  const v = bot.view;
  const me = v.me;
  checkLeaks(bot, v);
  // Small random delay so bots interleave like real players.
  setTimeout(async () => {
    if (bot.view !== v) return; // a newer state arrived; act on that instead
    if (v.phase === 'TEAM_BUILDING' && me.isLeader) {
      const size = v.quests[v.round].size;
      const team = [...v.players].sort(() => Math.random() - 0.5).slice(0, size).map((p) => p.id);
      await send(bot.socket, 'propose', { team });
    } else if (v.phase === 'TEAM_VOTE' && me.myVote === null) {
      await send(bot.socket, 'vote', { approve: Math.random() < 0.7 });
    } else if (v.phase === 'QUEST' && me.onTeam && me.myQuestCard === null) {
      if (me.role !== 'EVIL') {
        const res = await send(bot.socket, 'quest', { success: false });
        if (res.ok) throw new Error('Good player was allowed to Fail');
      }
      await send(bot.socket, 'quest', { success: me.role !== 'EVIL' || Math.random() < 0.5 });
    } else if (v.phase === 'MERLIN_VOTE' && me.role === 'EVIL') {
      // Converge on the target with the most votes (ties -> first candidate).
      const counts = {};
      for (const t of Object.values(v.merlinVote.votes)) counts[t] = (counts[t] ?? 0) + 1;
      const best = v.merlinVote.candidates.reduce((a, b) => ((counts[b] ?? 0) > (counts[a] ?? 0) ? b : a));
      const target = Object.keys(counts).length ? best : pick(v.merlinVote.candidates);
      if (v.merlinVote.myVote !== target) await send(bot.socket, 'merlinVote', { target });
    }
  }, Math.random() * 15);
}

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms));

try {
  for (let g = 1; g <= GAMES; g++) {
    const done = new Promise((r) => (resolveGame = r));
    const res = await send(host, 'start');
    if (!res.ok) throw new Error(`start failed: ${res.error}`);
    const end = await Promise.race([done, timeout(20000)]);
    if (!REASONS.includes(end.result.reason)) throw new Error(`bad end reason ${end.result.reason}`);
    if (!end.players.every((p) => p.role)) throw new Error('roles not revealed at game over');
    const quests = end.quests.map((q) => (q.result === 'SUCCESS' ? 'S' : q.result === 'FAIL' ? 'F' : '-')).join('');
    console.log(`game ${g}: ${end.result.winner} wins (${end.result.reason}), quests ${quests}, ${end.voteHistory.length} team votes`);
    finished.push(end);
    await send(host, 'reset');
  }

  // Host abort path.
  await send(host, 'start');
  const abort = await send(host, 'abort');
  if (!abort.ok || hostView.result?.reason !== 'aborted') throw new Error('abort failed');
  await send(host, 'reset');
  if (!hostView.admin.recentGames.length) throw new Error('recent games not recorded');

  console.log(`OK: ${finished.length} games with ${PLAYERS} players completed, plus abort.`);
} catch (err) {
  console.error('SIMULATION FAILED:', err.message);
  process.exitCode = 1;
} finally {
  for (const b of bots) b.socket.disconnect();
  host.disconnect();
  await app.close();
  process.exit();
}
