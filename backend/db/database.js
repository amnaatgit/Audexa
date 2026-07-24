/**
 * Postgres-backed persistence, wrapped to look like the synchronous
 * better-sqlite3 API (`db.prepare(sql).get()/.all()/.run()`) that scoring.js
 * and server.js already call — except every method is async here, so callers
 * must `await` it.
 *
 * Two SQLite-isms from the original call sites need translating, not rewriting:
 *  - `?` / `@name` placeholders  →  Postgres `$1,$2,...` positional params.
 *  - `INSERT OR REPLACE INTO ...` (SQLite upsert)  →  `... ON CONFLICT DO UPDATE`.
 *
 * Postgres also folds unquoted identifiers to lowercase, so a column declared
 * (and queried) as `vendorId` comes back from `pg` as `vendorid`. Rather than
 * quote every camelCase identifier across every query string, CAMEL_MAP below
 * remaps known lowercase-folded keys back to their camelCase form on every
 * row that comes out of the database, so `row.vendorId` keeps working.
 */
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.VERCEL ? 1 : 10, // serverless: one short-lived connection per invocation
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
})
pool.on('error', err => console.error('[db] unexpected Postgres pool error', err))

const CAMEL_MAP = Object.fromEntries([
  'ruleId', 'baseWeight', 'currentWeight', 'invoiceRef', 'totalMs', 'tokensIn', 'tokensOut', 'costUSD',
  'vendorId', 'vendorName', 'billFrom', 'shipFrom', 'lineItems', 'tier1Score', 'tier1Ms', 'reviewStatus',
  'invoiceId', 'precisionBefore', 'precisionAfter', 'passwordHash', 'prevHash',
].map(name => [name.toLowerCase(), name]))

function toCamelRow(row) {
  if (!row) return row
  const out = {}
  for (const [k, v] of Object.entries(row)) out[CAMEL_MAP[k] || k] = v
  return out
}

const schemaReady = (async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weights (
      ruleId TEXT PRIMARY KEY,
      baseWeight DOUBLE PRECISION NOT NULL,
      currentWeight DOUBLE PRECISION NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS traces (
      id SERIAL PRIMARY KEY,
      ts BIGINT NOT NULL,
      invoiceRef TEXT,
      vendor TEXT,
      totalMs DOUBLE PRECISION,
      tokensIn INTEGER,
      tokensOut INTEGER,
      costUSD DOUBLE PRECISION,
      spans TEXT,
      engine TEXT
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      vendorId TEXT,
      vendorName TEXT,
      category TEXT,
      invoiceRef TEXT,
      amount DOUBLE PRECISION,
      billFrom TEXT,
      shipFrom TEXT,
      hour INTEGER,
      lineItems TEXT,
      score INTEGER,
      tier1Score INTEGER,
      tier1Ms DOUBLE PRECISION,
      decision TEXT,
      factors TEXT,
      audit TEXT,
      reviewStatus TEXT
    );
    CREATE TABLE IF NOT EXISTS feedback_events (
      id SERIAL PRIMARY KEY,
      ts TEXT,
      actor TEXT,
      invoiceId TEXT,
      verdict TEXT,
      precisionBefore DOUBLE PRECISION,
      precisionAfter DOUBLE PRECISION
    );
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      ts TEXT NOT NULL,
      actor TEXT,
      action TEXT,
      invoiceId TEXT,
      detail TEXT,
      hash TEXT NOT NULL,
      prevHash TEXT
    );
  `)
})()
schemaReady.catch(err => console.error('[db] schema init failed', err))

// Compile a `?` or `@name` placeholder statement into `$1,$2,...` form, plus
// a resolver that turns the caller's args (positional, or a single named
// object for `@name` statements) into a positionally-ordered params array.
function compile(sql) {
  const named = [...sql.matchAll(/@(\w+)/g)].map(m => m[1])
  if (named.length) {
    const order = [...new Set(named)]
    const text = sql.replace(/@(\w+)/g, (_, name) => `$${order.indexOf(name) + 1}`)
    return { text, toParams: obj => order.map(n => obj[n]) }
  }
  let i = 0
  const text = sql.replace(/\?/g, () => `$${++i}`)
  return { text, toParams: args => args }
}

function toUpsert(text) {
  const m = text.match(/^INSERT OR REPLACE INTO (\w+) \(([^)]+)\)/i)
  if (!m) return text
  const [, table, colsRaw] = m
  const cols = colsRaw.split(',').map(c => c.trim())
  const conflictKey = cols[0] // every INSERT OR REPLACE in this app conflicts on its first/primary-key column
  const updates = cols.slice(1).map(c => `${c}=EXCLUDED.${c}`).join(', ')
  return text.replace(/^INSERT OR REPLACE INTO/i, 'INSERT INTO') + ` ON CONFLICT (${conflictKey}) DO UPDATE SET ${updates}`
}

function resolveParams(toParams, args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) return toParams(args[0])
  return toParams(args)
}

function prepare(sql) {
  const isUpsert = /^INSERT OR REPLACE/i.test(sql.trim())
  const compiled = compile(sql)
  const text = isUpsert ? toUpsert(compiled.text) : compiled.text
  return {
    async run(...args) {
      await schemaReady
      const result = await pool.query(text, resolveParams(compiled.toParams, args))
      return { changes: result.rowCount }
    },
    async get(...args) {
      await schemaReady
      const result = await pool.query(text, resolveParams(compiled.toParams, args))
      return toCamelRow(result.rows[0])
    },
    async all(...args) {
      await schemaReady
      const result = await pool.query(text, resolveParams(compiled.toParams, args))
      return result.rows.map(toCamelRow)
    },
  }
}

module.exports = { prepare, pool }
