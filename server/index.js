import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { config as defaultConfig } from './config.js';
import { openDb } from './db.js';
import { createHub } from './hub.js';
import { GameError } from './game/engine.js';

export function startServer(overrides = {}) {
  const config = { ...defaultConfig, ...overrides };
  const db = openDb(config.dbPath);
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const hub = createHub({ io, db, config });

  app.use(express.json({ limit: '10kb' }));

  app.post('/api/login', (req, res) => {
    const { name, password } = req.body ?? {};
    if (password !== config.playerPassword) return res.status(401).json({ error: 'Wrong password.' });
    try {
      res.json(hub.joinAsPlayer(name));
    } catch (err) {
      if (!(err instanceof GameError)) throw err;
      res.status(409).json({ error: err.message });
    }
  });

  app.post('/api/host-login', (req, res) => {
    if (req.body?.password !== config.hostPassword) return res.status(401).json({ error: 'Wrong host password.' });
    res.json(hub.hostLogin());
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Built React client (npm run build). Any non-API GET falls back to index.html
  // so /host works on refresh.
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  return new Promise((resolve) => {
    server.listen(config.port, () => {
      resolve({ server, io, hub, db, port: server.address().port, close: () => new Promise((r) => { hub.stop(); io.close(() => r()); }) });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { port } = await startServer();
  console.log(`Avalon server listening on http://localhost:${port}`);
}
