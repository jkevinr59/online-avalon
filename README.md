# Avalon Online

A phone-friendly web companion for **The Resistance: Avalon** (5–10 players).
Everyone sits at the same table, or on a call, and uses their own phone in
place of the role cards, vote tokens and quest cards. The app also takes over
the "close your eyes" night phase.

- **Roles:** Loyal Servant (Good), Merlin (Good), Minion of Mordred (Evil)
- **Full round flow:**
  - The leader proposes a team, then everyone votes in secret and the votes
    are revealed together.
  - The quest team plays cards in secret, and only the totals are revealed.
- **Rules enforced by the app:**
  - A team needs a strict majority to be approved.
  - Five rejected teams in a row mean Evil wins.
  - In games of 7+ players, Quest 4 needs two Fail cards to fail.
- **Endgame:** the Evil team unmasks and votes on who Merlin is. The guess
  locks when a strict majority of Evil agree.
- **New-player friendly:**
  - Each player sees their role on a full page at the start, with tips for
    playing it.
  - Picking a team, voting, playing a quest card and guessing Merlin happen
    in pop-ups. A floating button reopens a pop-up that was closed.
  - After every vote and quest, everyone sees the result for 20 seconds,
    along with who leads next or who goes on the quest.
  - Tips depend on the player's role, and a "How to play" page is always
    available. Tips can be turned off.
- **Languages:** Indonesian (default) and English, switchable on every screen.
- **Host dashboard (`/host`):** the host sees who joined and can kick players,
  start the game, play as well, end a game early and start a new game with the
  same players. The dashboard shows only public information.

## Running locally

Requires **Node 22.13+** (Node 24 recommended), which ships the built-in
`node:sqlite`.

```bash
npm install
npm run dev        # server on :3000, Vite client on http://localhost:5173
```

- Players open `http://localhost:5173` (or `http://<your LAN IP>:5173` from a phone).
- The host opens `http://localhost:5173/host`.

Default passwords (override with environment variables, or copy `.env.example`
to `.env`, which `npm run dev` and `npm start` load automatically):

| Who    | Env var           | Default       |
| ------ | ----------------- | ------------- |
| Player | `PLAYER_PASSWORD` | `avalon`      |
| Host   | `HOST_PASSWORD`   | `avalon-host` |

Production mode, with one process and one port:

```bash
npm run build
npm start          # http://localhost:3000
```

Other settings:

| Env var           | Default | What it does                                                      |
| ----------------- | ------- | ----------------------------------------------------------------- |
| `RESULT_PAUSE_MS` | `20000` | How long a vote or quest result stays on screen.                  |
| `DEV_ROLES`       | off     | `1` gives players named `alwaysgood`, `alwaysevil` or `alwaysmerlin` that role. |

`DEV_ROLES` is for development only, and `npm run dev` turns it on. A name
only has to start with the keyword (e.g. `alwaysevil2`), because names must be
unique. When more players ask for a role than it has seats, the first to join
gets it. Never enable it for real games.

## Tests

```bash
npm test                                      # engine rules + "no secret leaks" checks
npm run simulate -- --players 7 --games 5     # bots play full games over real sockets
```

To play a real game yourself with fewer people, let bots fill the other seats
on the running server (`npm run dev` or `npm start`):

```bash
npm run bots                                  # 4 bots named "Bot 1".."Bot 4"
npm run bots -- --count 3 --delay 3000        # 3 bots, ~3 s thinking time
```

Bots only join while the server is in the lobby. If a game is running or
finished, they keep retrying until the host presses "New game". Stop them with
Ctrl+C.

## How it works

```
server/
  game/engine.js   pure state machine: every rule lives here
  game/view.js     what ONE viewer may see (roles, knowledge, secret votes)
  hub.js           live game, sessions, presence, Socket.IO broadcast
  db.js            SQLite: rules table, game history, live-state snapshot
  index.js         Express API + static client
client/src/
  pages/           PlayerApp (/) and HostApp (/host)
  components/      board, role card, phase panels
```

- **The server holds all the secrets.** Each connected socket gets its own
  projection of the game from `view.js`, so roles, other players' votes and
  quest cards never reach a browser that shouldn't see them.
- **Sessions are tokens kept in `localStorage`.** Refreshing a page or a phone
  going to sleep reconnects you to the same seat. If you lose your session
  completely, log in again with the exact same name while your old session is
  offline.
- **The live game is saved to SQLite after every move**, so restarting the
  server resumes the game in progress.
- **Rules per player count live in the `rules` table**, seeded from the rules
  guide.

## Deployment

See [deploy/README.md](deploy/README.md) for setting it up on a Google Cloud
e2-micro VM.
