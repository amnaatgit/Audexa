const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function seedUsers() {
    try {
          const auditor = db.prepare('SELECT * FROM users WHERE username=?').get('auditor');
          if (!auditor) {
                  const hash = bcrypt.hashSync('auditor123', 10);
                  db.prepare('INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)').run('auditor', hash, 'auditor');
          }
          const admin = db.prepare('SELECT * FROM users WHERE username=?').get('admin');
          if (!admin) {
                  const hash = bcrypt.hashSync('admin123', 10);
                  db.prepare('INSERT INTO users (username, passwordHash, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
          }
    } catch (error) {
          console.error('Error seeding users:', error);
    }
}

function login(username, password) {
    if (!username || !password) return null;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return null;
    const valid = bcrypt.compareSync(password, user.passwordHash);
    if (!valid) return null;
    const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    return { user: { username: user.username, role: user.role }, token };
}

function logAction(username, action, details = null) {
    try {
          const auditLog = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 1').get();
          const prevHash = auditLog ? auditLog.hash : '0';
          const data = JSON.stringify({ username, action, details, ts: new Date().toISOString() });
          const hash = crypto.createHash('sha256').update(data + prevHash).digest('hex');
          db.prepare('INSERT INTO audit_log (username, action, details, hash, prevHash) VALUES (?, ?, ?, ?, ?)').run(
                  username, action, details ? JSON.stringify(details) : null, hash, prevHash
                );
    } catch (error) {
          console.error('Error logging action:', error);
    }
}

function verifyToken(token) {
    try {
          return jwt.verify(token, JWT_SECRET);
    } catch (error) {
          return null;
    }
}

module.exports = { login, logAction, seedUsers, verifyToken };
