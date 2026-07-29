const BASE = import.meta.env.VITE_API_URL || ''
let token = localStorage.getItem('sentinel_token') || null
export const auth = {
  get token(){ return token },
  set(t){ token = t; t ? localStorage.setItem('sentinel_token', t) : localStorage.removeItem('sentinel_token') },
  user(){ try { return JSON.parse(localStorage.getItem('sentinel_user')||'null') } catch { return null } },
  setUser(u){ localStorage.setItem('sentinel_user', JSON.stringify(u)) },
  logout(){ token=null; localStorage.removeItem('sentinel_token'); localStorage.removeItem('sentinel_user') },
}
const hdr = (extra={}) => ({ 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{}) , ...extra })
const j = r => r.json().catch(()=>({})).then(body => {
  if (!r.ok) {
    if (r.status === 401 && token) {
      auth.logout()
      alert('Your session has expired \u2014 please sign in again.')
      window.location.reload()
    }
    const err = new Error((body && body.error) || `Request failed (${r.status})`)
    err.status = r.status
    throw err
  }
  return body
})
export const api = {
  login: (username,password) => fetch(`${BASE}/api/login`,{method:'POST',headers:hdr(),body:JSON.stringify({username,password})}).then(j),
  score: (inv) => fetch(`${BASE}/api/score`,{method:'POST',headers:hdr(),body:JSON.stringify(inv)}).then(j),
  simulate:() => fetch(`${BASE}/api/simulate`,{method:'POST',headers:hdr()}).then(j),
  txns: (limit=40) => fetch(`${BASE}/api/transactions?limit=${limit}`).then(j),
  vendors: () => fetch(`${BASE}/api/vendors`).then(j),
  lineItems:() => fetch(`${BASE}/api/line-items`).then(j),
  queue: () => fetch(`${BASE}/api/review-queue`).then(j),
  review: (id,fraud) => fetch(`${BASE}/api/review/${id}`,{method:'POST',headers:hdr(),body:JSON.stringify({fraud})}).then(j),
  model: () => fetch(`${BASE}/api/model`).then(j),
  telemetry:() => fetch(`${BASE}/api/telemetry`).then(j),
  stats: () => fetch(`${BASE}/api/stats`).then(j),
  evaluation:() => fetch(`${BASE}/api/evaluation`).then(j),
  evaluate:(n) => fetch(`${BASE}/api/evaluate`,{method:'POST',headers:hdr(),body:JSON.stringify({n})}).then(j),
  retrain: () => fetch(`${BASE}/api/retrain`,{method:'POST',headers:hdr()}).then(j),
  thresholds:(t) => fetch(`${BASE}/api/thresholds`,{method:'POST',headers:hdr(),body:JSON.stringify(t)}).then(j),
  auditLog:() => fetch(`${BASE}/api/audit-log`,{headers:hdr()}).then(j),
  feedbackHistory:() => fetch(`${BASE}/api/feedback-history`).then(j),
}
