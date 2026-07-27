/**
 * Audexa — Hybrid Enterprise ERP Fraud Engine (v4)
 * Persistent (Postgres) · ML-backed (Isolation Forest) · Evaluable · Authenticated
 */
const express = require('express')
const cors = require('cors')
const scoring = require('./engine/scoring')
const { VENDORS, CONTRACTS, LINE_ITEMS } = require('./engine/contracts')
const mcp = require('./mcp/auditServer')
const db = require('./db/database')
const auth = require('./db/auth')

const app = express()
app.use(cors());
app.use(express.json());

let idSeq = 4000
const VIDS = Object.keys(VENDORS)

// boot: load persisted state, train forest, seed users, run first eval
const ready = (async () => {
  await scoring.init()
  await auth.seedUsers()
  await auth.logAction('system', 'server_start')
  const idRows = await db.prepare("SELECT id FROM invoices").all()
  idSeq = idRows.reduce((max, r) => Math.max(max, Number(r.id.slice(3)) || 0), 4000)
})()
ready.catch(err => console.error('[boot] initialization failed', err))

function randomInvoice(){
  const risky = Math.random()<0.25
  const vendorId = VIDS[Math.floor(Math.random()*VIDS.length)], v = VENDORS[vendorId]
  const items = risky && Math.random()<0.7 ? Object.keys(LINE_ITEMS).sort(()=>Math.random()-.5).slice(0,1+Math.floor(Math.random()*3)) : []
  return { vendorId, vendorName:v.name, category:v.category, onboardedDays:v.onboardedDays,
    invoiceRef:'INV-'+(risky&&Math.random()<0.3?7777:Math.floor(1000+Math.random()*9000)),
    amount: risky?Math.round(v.avgInvoice*(2.5+Math.random()*3)):Math.round(v.avgInvoice*(0.7+Math.random()*0.6)),
    billFrom:v.homeCountry, shipFrom: risky&&Math.random()<0.5?['RU','NG','IR','KP','BY'][Math.floor(Math.random()*5)]:v.homeCountry,
    hour: risky&&Math.random()<0.4?3:8+Math.floor(Math.random()*10), lineItems:items }
}

const insInvoice = db.prepare(`INSERT INTO invoices (id,ts,vendorId,vendorName,category,invoiceRef,amount,billFrom,shipFrom,hour,lineItems,score,tier1Score,tier1Ms,decision,factors,audit,reviewStatus) VALUES (@id,@ts,@vendorId,@vendorName,@category,@invoiceRef,@amount,@billFrom,@shipFrom,@hour,@lineItems,@score,@tier1Score,@tier1Ms,@decision,@factors,@audit,@reviewStatus)`)

async function processInvoice(input){
  await ready
  const result = await scoring.scoreInvoice(input)
  const record = { id:'AP-'+(++idSeq), ts:new Date().toISOString(), ...input, ...result }
  await insInvoice.run({
    id:record.id, ts:record.ts, vendorId:record.vendorId, vendorName:record.vendorName, category:record.category,
    invoiceRef:record.invoiceRef, amount:record.amount, billFrom:record.billFrom, shipFrom:record.shipFrom, hour:record.hour,
    lineItems:JSON.stringify(record.lineItems), score:record.score, tier1Score:record.tier1Score, tier1Ms:record.tier1Ms,
    decision:record.decision, factors:JSON.stringify(record.factors), audit:record.audit?JSON.stringify(record.audit):null,
    reviewStatus: record.decision==='REVIEW'?'pending':null,
  })
  return record
}
function rowToInvoice(r){ return { ...r, lineItems:JSON.parse(r.lineItems||'[]'), factors:JSON.parse(r.factors||'[]'), audit:r.audit?JSON.parse(r.audit):null } }

/* ── Public: auth ── */
app.post('/api/login', async (req,res)=>{
  await ready
      const { username, password } = req.body
  const r = await auth.login(username, password)
  if (!r) { await auth.logAction(username||'unknown','login_failed'); return res.status(401).json({ error:'Invalid credentials' }) }
  await auth.logAction(r.user.username,'login_success')
  res.json(r)
})

/* ── Public reads (dashboards need no auth) ── */
app.post('/api/score', async (req,res)=>{
  const t=req.body, v=VENDORS[t.vendorId]||VENDORS['VND-101']
  res.json(await processInvoice({ vendorId:t.vendorId||'VND-101', vendorName:v.name, category:v.category,
    onboardedDays:Number(t.onboardedDays??v.onboardedDays),
    invoiceRef:t.duplicate?'INV-7777':'INV-'+Math.floor(1000+Math.random()*9000),
    amount:Number(t.amount)||1000, billFrom:v.homeCountry, shipFrom:t.shipFrom||v.homeCountry,
    hour:Number(t.hour??11), lineItems:Array.isArray(t.lineItems)?t.lineItems:[] }))
})
app.post('/api/simulate', async (req,res)=>res.json(await processInvoice(randomInvoice())))
app.get('/api/transactions', async (req,res)=>res.json((await db.prepare('SELECT * FROM invoices ORDER BY ts DESC LIMIT ?').all(Number(req.query.limit)||40)).map(rowToInvoice)))
app.get('/api/vendors', (req,res)=>res.json(Object.entries(VENDORS).map(([id,v])=>({ id, ...v, contract:CONTRACTS[id] }))))
app.get('/api/line-items', (req,res)=>res.json(LINE_ITEMS))
app.get('/api/model', async (req,res)=>res.json(await scoring.getModelInfo()))
app.get('/api/telemetry', async (req,res)=>res.json(await scoring.getTelemetry()))
app.get('/api/evaluation', async (req,res)=>res.json(await scoring.getLastEval()))
app.get('/api/feedback-history', async (req,res)=>res.json(await scoring.getFeedbackHistory()))
app.post('/mcp', async (req,res)=>res.json(await mcp.handle(req.body)))

app.get('/api/review-queue', async (req,res)=>res.json((await db.prepare("SELECT * FROM invoices WHERE reviewStatus='pending' ORDER BY ts DESC LIMIT 30").all()).map(rowToInvoice)))

app.get('/api/stats', async (req,res)=>{
  const all = (await db.prepare('SELECT * FROM invoices').all()).map(rowToInvoice)
  const total=all.length, blocked=all.filter(t=>t.decision==='BLOCKED').length, review=all.filter(t=>t.decision==='REVIEW').length, approved=all.filter(t=>t.decision==='APPROVED').length
  const avgScore=total?Math.round(all.reduce((a,t)=>a+t.score,0)/total):0
  const buckets=[0,0,0,0,0]; all.forEach(t=>buckets[Math.min(4,Math.floor(t.score/20))]++)
  const factorFreq={}, vendorRisk={}; let tier2=0, violations=0
  all.forEach(t=>{ t.factors.forEach(f=>{factorFreq[f.name]=(factorFreq[f.name]||0)+1; if(f.tier===2)violations++}); if(t.audit)tier2++; if(t.score>=40)vendorRisk[t.vendorName]=(vendorRisk[t.vendorName]||0)+1 })
  res.json({ total,blocked,review,approved,avgScore,buckets,tier2,violations,
    topFactors:Object.entries(factorFreq).sort((a,b)=>b[1]-a[1]).slice(0,6),
    hotVendors:Object.entries(vendorRisk).sort((a,b)=>b[1]-a[1]).slice(0,6),
    highRisk:all.filter(t=>t.score>=70).slice(0,5),
    amountAtRisk:all.filter(t=>t.decision==='BLOCKED').reduce((a,t)=>a+t.amount,0) })
})

/* ── Protected: verdicts, tuning, retrain, audit log (require JWT) ── */
app.post('/api/review/:id', auth.authMiddleware, async (req,res)=>{
  const item = await db.prepare("SELECT * FROM invoices WHERE id=? AND reviewStatus='pending'").get(req.params.id)
  if (!item) return res.status(404).json({ error:'Not found' })
  const fraud = !!req.body.fraud
  await db.prepare('UPDATE invoices SET reviewStatus=? WHERE id=?').run(fraud?'confirmed_fraud':'legitimate', item.id)
  const val = await scoring.applyFeedback(JSON.parse(item.factors), fraud, req.user.username, item.id)
  await auth.logAction(req.user.username, fraud?'verdict_fraud':'verdict_legit', item.id, `score=${item.score} precisionΔ=${val.before}->${val.after}`)
  res.json({ ok:true, validation:val })
})
app.post('/api/thresholds', auth.authMiddleware, async (req,res)=>{
  const ok=await scoring.setThresholds(Number(req.body.review),Number(req.body.block))
  if (ok) await auth.logAction(req.user.username,'set_thresholds',null,`review=${req.body.review} block=${req.body.block}`)
  res.json({ ok })
})
app.post('/api/retrain', auth.authMiddleware, async (req,res)=>{
  const f=await scoring.trainForest(); const ev=await scoring.runEvaluation(400)
  await auth.logAction(req.user.username,'retrain_model',null,`AUPRC=${ev.auprc.toFixed(3)}`)
  res.json({ forest:f, evaluation:ev })
})
app.post('/api/evaluate', auth.authMiddleware, async (req,res)=>{
  const ev=await scoring.runEvaluation(Number(req.body.n)||400)
  await auth.logAction(req.user.username,'run_evaluation',null,`P=${ev.operating.precision.toFixed(3)} R=${ev.operating.recall.toFixed(3)}`)
  res.json(ev)
})
app.get('/api/audit-log', auth.authMiddleware, async (req,res)=>res.json({ entries: await auth.getAuditLog(60), integrity: await auth.verifyAuditChain() }))

app.get('/health', (req,res)=>res.json({ status:'ok', service:'Audexa ERP Fraud Engine v4' }))
const PORT = process.env.PORT||3000
if (require.main === module) {
  ready.then(() => app.listen(PORT, ()=>console.log(`🛡️  Audexa ERP Fraud Engine v4 on :${PORT}`)))
}
module.exports = app
