import { Pool } from 'pg';

declare global {
    // Allow globalThis.pgPool to be reused across reloads
    // eslint-disable-next-line no-var
    var pgPool: Pool | undefined;
}

const pool =
    global.pgPool ??
    new Pool({
        connectionString: process.env.DATABASE_URL, // atau config manual
    });

if (process.env.NODE_ENV !== 'production') {
    global.pgPool = pool; // cache pool untuk development
}

export default pool;

