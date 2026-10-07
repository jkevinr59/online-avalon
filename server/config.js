import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Shared passwords, as in the design doc. Override them via environment on the VM.
  playerPassword: process.env.PLAYER_PASSWORD ?? 'avalon',
  hostPassword: process.env.HOST_PASSWORD ?? 'avalon-host',
  dbPath: process.env.DB_PATH ?? path.join(ROOT, 'data', 'avalon.db'),
  clientDist: path.join(ROOT, 'client', 'dist'),
  // How long everyone sees a vote / quest result before the game moves on.
  resultPauseMs: Number(process.env.RESULT_PAUSE_MS ?? 20000),
  // Development helper: players named alwaysgood / alwaysevil / alwaysmerlin
  // get that role. Never enable it for real games.
  devRoles: process.env.DEV_ROLES === '1' || process.argv.includes('--dev-roles'),
};
