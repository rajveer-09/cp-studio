import pg from 'pg';
import { config } from './config.js';

/** node-postgres treats "require" as full certificate checking anyway; saying so avoids its warning. */
const connectionString = config.databaseUrl.replace(/([?&]sslmode=)require\b/, '$1verify-full');

/** The Postgres pool (Neon), or null when DATABASE_URL isn't set. */
export const pool = connectionString
  ? new pg.Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      // A sleeping Neon database takes a moment to wake up.
      connectionTimeoutMillis: 15_000,
    })
  : null;

pool?.on('error', (err) => console.error(`Postgres: ${err.message}`));
