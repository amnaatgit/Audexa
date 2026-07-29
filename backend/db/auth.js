/**
 * Auth + tamper-evident audit log, on top of the async Postgres db facade.
 * Every audit_log row's hash includes the previous row's hash, so
 * verifyAuditChain() can detect any row edited or deleted out of band.
 */
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const db = require('./database')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me'
if (!process.env.JWT_SECRET) { if (process.env.NODE_ENV === 'production') throw new Error('[auth] JWT_SECRET must be set in production — refusing to start with an insecure default'); console.warn('[auth] JWT_SECRET not set — using an insecure dev default (dev only).') }
const TOKEN_TTL = '8h'

const DEFAULT_USERS = [
  { username: 'auditor', password: 'audit123', role: 'auditor' },
  { username: 'admin', password: 'admin123', role: 'admin' },
]

async function seedUsers() {
  const { n } = await db.prepare('SELECT COUNT(*) n FROM users').get()
  if (Number(n) > 0) return
  const ins = db.prepare('INSERT INTO users (username, passwordHash, role) VALUES (?,?,?)')
  for (const u of DEFAULT_USERS) await ins.run(u.username, bcrypt.hashSync(u.password, 10), u.role)
}

async function login(username, password) {
  const row = await db.prepare('SELECT * FROM users WHERE username=?').get(username)
  if (!row || !bcrypt.compareSync(password || '', row.passwordHash)) return null
  const token = jwt.sign({ username: row.username, role: row.role }, JWT_SECRET, { expiresIn: TOKEN_TTL })
  return { token, user: { username: row.username, role: row.role } }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing token' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

function chainHash(prevHash, actor, action, invoiceId, detail, ts) {
  return crypto.createHash('sha256')
    .update(`${prevHash}|${actor}|${action}|${invoiceId || ''}|${detail || ''}|${ts}`)
    .digest('hex')
}

async function logAction(actor, action, invoiceId = null, detail = null) {
  const ts = new Date().toISOString()
  const prev = await db.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').get()
  const prevHash = prev ? prev.hash : ''
  const hash = chainHash(prevHash, actor, action, invoiceId, detail, ts)
  await db.prepare('INSERT INTO audit_log (ts,actor,action,invoiceId,detail,hash,prevHash) VALUES (?,?,?,?,?,?,?)')
    .run(ts, actor, action, invoiceId, detail, hash, prevHash)
}

async function getAuditLog(n = 60) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(n)
}

async function verifyAuditChain() {
  const rows = await db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all()
  let prevHash = ''
  for (const r of rows) {
    const expected = chainHash(prevHash, r.actor, r.action, r.invoiceId, r.detail, r.ts)
    if (expected !== r.hash) return { valid: false, brokenAt: r.id, checkedEntries: rows.length }
    prevHash = r.hash
  }
  return { valid: true, brokenAt: null, checkedEntries: rows.length }
}

function requireAdmin(req, res, next) { if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' }); next() }module.exports = { seedUsers, login, authMiddleware, requireAdmin, logAction, getAuditLog, verifyAuditChain }
