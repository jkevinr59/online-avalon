import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Rule table from "Avalon Rules Guide": player count -> team split and quest sizes.
// Quest 4 needs two Fail cards in games of 7+ players.
const RULES_SEED = [
  [5, 3, 2, [2, 3, 2, 3, 3], 0],
  [6, 4, 2, [2, 3, 4, 3, 4], 0],
  [7, 4, 3, [2, 3, 3, 4, 4], 1],
  [8, 5, 3, [3, 4, 4, 5, 5], 1],
  [9, 6, 3, [3, 4, 4, 5, 5], 1],
  [10, 6, 4, [3, 4, 4, 5, 5], 1],
];

export function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS rules (
      player_count INTEGER PRIMARY KEY,
      good INTEGER NOT NULL,
      evil INTEGER NOT NULL,
      q1 INTEGER NOT NULL, q2 INTEGER NOT NULL, q3 INTEGER NOT NULL, q4 INTEGER NOT NULL, q5 INTEGER NOT NULL,
      q4_double_fail INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      player_count INTEGER NOT NULL,
      winner TEXT,
      reason TEXT
    );
    CREATE TABLE IF NOT EXISTS game_players (
      game_id TEXT NOT NULL REFERENCES games(id),
      seat INTEGER NOT NULL,
      player_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY (game_id, seat)
    );
    CREATE TABLE IF NOT EXISTS game_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL REFERENCES games(id),
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS live_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const seed = db.prepare(
    'INSERT OR IGNORE INTO rules (player_count, good, evil, q1, q2, q3, q4, q5, q4_double_fail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const [n, good, evil, q, dbl] of RULES_SEED) seed.run(n, good, evil, ...q, dbl);

  const stmts = {
    rule: db.prepare('SELECT * FROM rules WHERE player_count = ?'),
    allRules: db.prepare('SELECT * FROM rules ORDER BY player_count'),
    insertGame: db.prepare('INSERT INTO games (id, started_at, player_count) VALUES (?, ?, ?)'),
    insertPlayer: db.prepare('INSERT INTO game_players (game_id, seat, player_id, name, role) VALUES (?, ?, ?, ?, ?)'),
    endGame: db.prepare('UPDATE games SET ended_at = ?, winner = ?, reason = ? WHERE id = ?'),
    insertEvent: db.prepare('INSERT INTO game_events (game_id, type, payload_json, at) VALUES (?, ?, ?, ?)'),
    recentGames: db.prepare(`
      SELECT g.id, g.started_at, g.ended_at, g.player_count, g.winner, g.reason,
             (SELECT group_concat(entry, ', ') FROM (
                SELECT name || ':' || role AS entry FROM game_players WHERE game_id = g.id ORDER BY seat
             )) AS players
      FROM games g
      WHERE g.ended_at IS NOT NULL -- never expose roles of the game in progress
      ORDER BY g.started_at DESC LIMIT ?`),
    loadLive: db.prepare('SELECT json FROM live_state WHERE id = 1'),
    saveLive: db.prepare(`
      INSERT INTO live_state (id, json, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`),
  };

  const now = () => new Date().toISOString();

  // Shapes a rules row into what the engine needs.
  function toRules(row) {
    if (!row) return null;
    return {
      playerCount: row.player_count,
      good: row.good,
      evil: row.evil,
      quests: [row.q1, row.q2, row.q3, row.q4, row.q5].map((size, i) => ({
        size,
        failsNeeded: i === 3 && row.q4_double_fail ? 2 : 1,
      })),
    };
  }

  return {
    raw: db,
    rulesFor: (n) => toRules(stmts.rule.get(n)),
    allRules: () => stmts.allRules.all().map(toRules),
    recentGames: (limit = 10) => stmts.recentGames.all(limit),

    loadLive() {
      const row = stmts.loadLive.get();
      return row ? JSON.parse(row.json) : null;
    },
    saveLive(obj) {
      stmts.saveLive.run(JSON.stringify(obj), now());
    },

    // Writes engine events into the history tables.
    recordEvents(gameId, events) {
      for (const ev of events) {
        if (ev.type === 'game_start') {
          stmts.insertGame.run(gameId, now(), ev.players.length);
          for (const p of ev.players) stmts.insertPlayer.run(gameId, p.seat, p.id, p.name, p.role);
        }
        if (ev.type === 'game_end') stmts.endGame.run(now(), ev.winner, ev.reason, gameId);
        stmts.insertEvent.run(gameId, ev.type, JSON.stringify(ev), now());
      }
    },
  };
}
