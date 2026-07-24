/**
 * SentinelAI Hybrid Scoring Orchestrator — persistent, ML-backed, evaluable.
 *  Tier 1: rules ensemble + TRAINED Isolation Forest anomaly model
 *  Tier 2: MCP contract-audit orchestration (see mcp/auditServer.js)
 *  Persistence: weights, traces, telemetry all in SQLite
 *  Evaluation: computes precision/recall/AUPRC on a labelled test set
 */
const { RULES } = require('./rules')
const { VENDORS } = require('./contracts')
const mcp = require('../mcp/auditServer')
const db = require('../db/database')
const { IsolationForest, featureVector } = require('../ml/isolationForest')
const { generate } = require('../ml/dataset')
const { evaluate } = require('../ml/metrics')

/* ── Weights: load from DB or seed from rule defaults ── */
const weights = {}
function loadWeights(){
  const rows = db.prepare('SELECT ruleId, currentWeight FROM weights').all()
  if (rows.length){ rows.forEach(r => weights[r.ruleId] = r.currentWeight) }
  else {
    const ins = db.prepare('INSERT INTO weights (ruleId, baseWeight, currentWeight) VALUES (?,?,?)')
    RULES.forEach(r => { weights[r.id] = r.weight; ins.run(r.id, r.weight, r.weight) })
  }
  // ML anomaly weight is a tunable too
  const mlRow = db.prepare("SELECT currentWeight FROM weights WHERE ruleId='ml_anomaly'").get()
  if (!mlRow){ db.prepare('INSERT INTO weights (ruleId, baseWeight, currentWeight) VALUES (?,?,?)').run('ml_anomaly',20,20); weights['ml_anomaly']=20 }
  else weights['ml_anomaly'] = mlRow.currentWeight
}
function saveWeight(id){ db.prepare('UPDATE weights SET currentWeight=? WHERE ruleId=?').run(weights[id], id) }

/* ── Isolation Forest: train on synthetic history, persist metadata ── */
let forest = new IsolationForest({ nTrees:100, sampleSize:256 })
let forestMeta = { trained:false }
function trainForest(){
  const data = generate(800, 0.12)
  const X = data.map(inv => featureVector(inv, VENDORS[inv.vendorId]?.avgInvoice || 5000))
  forest.fit(X)
  forestMeta = { trained:true, trainedOn:forest.trainedOn, nTrees:forest.nTrees, sampleSize:forest.sampleSize, at:new Date().toISOString() }
  db.prepare('INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)').run('forest', JSON.stringify(forestMeta))
  return forestMeta
}

const model = { version:'4.0.0', labeledSamples:0, confirmedFraud:0, falsePositives:0, lastAdjustment:null, tier2Calls:0 }
function loadModelMeta(){
  const m = db.prepare("SELECT v FROM meta WHERE k='model'").get()
  if (m) Object.assign(model, JSON.parse(m.v))
  const f = db.prepare("SELECT v FROM meta WHERE k='forest'").get()
  if (f) forestMeta = JSON.parse(f.v)
}
function saveModelMeta(){ db.prepare('INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)').run('model', JSON.stringify(model)) }

const THRESHOLDS = { review:40, block:70 }
function loadThresholds(){ const t=db.prepare("SELECT v FROM meta WHERE k='thresholds'").get(); if(t) Object.assign(THRESHOLDS, JSON.parse(t.v)) }
function setThresholds(review, block){
  if (review>=10 && block>review && block<=95){ THRESHOLDS.review=review; THRESHOLDS.block=block
    db.prepare('INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)').run('thresholds', JSON.stringify(THRESHOLDS)); return true }
  return false
}

// vendor state for velocity/duplicate (rebuilt from DB on boot)
const vendorState = new Map()
function getContext(inv){
  const st = vendorState.get(inv.vendorId) || { ts:[], seenRefs:new Set() }
  const now = Date.now()
  return { recentCount: st.ts.filter(t=>now-t<600000).length, isDuplicate: st.seenRefs.has(inv.invoiceRef),
           vendorAvg: VENDORS[inv.vendorId]?.avgInvoice || 5000, zscore:0, _st:st }
}

/* Telemetry (persisted) */
const tier1Lat = []
function recordTier1(ms){ tier1Lat.push(ms); if (tier1Lat.length>200) tier1Lat.shift() }

/* ── Core scoring (async because Tier-2 may call the LLM) ── */
async function scoreInvoice(inv, persist=true){
  const _t1 = performance.now()
  const ctx = getContext(inv)
  const factors = []
  let raw = 0
  for (const rule of RULES){
    const sev = rule.check(inv, ctx)
    if (sev>0.01){
      const contribution = +(weights[rule.id]*sev).toFixed(1); raw += contribution
      factors.push({ id:rule.id, name:rule.name, severity:+sev.toFixed(2), weight:weights[rule.id], contribution, explain:rule.explain(inv,ctx), tier:1 })
    }
  }
  // ── TRAINED ML anomaly signal ──
  if (forestMeta.trained){
    const fv = featureVector(inv, ctx.vendorAvg)
    const anom = forest.score(fv)                    // 0..1
    const sev = Math.max(0, (anom - 0.5) * 2)         // only above-average anomaly contributes
    if (sev > 0.02){
      const contribution = +(weights['ml_anomaly']*sev).toFixed(1); raw += contribution
      factors.push({ id:'ml_anomaly', name:'Isolation Forest Anomaly', severity:+sev.toFixed(2), weight:weights['ml_anomaly'], contribution,
        explain:`Trained anomaly model isolates this invoice with score ${anom.toFixed(2)} (ensemble of ${forest.nTrees} isolation trees)`, tier:1 })
    }
  }
  let tier1Score = Math.min(100, Math.round(raw))
  const tier1Ms = +(performance.now()-_t1).toFixed(3); recordTier1(tier1Ms)
  factors.sort((a,b)=>b.contribution-a.contribution)

  let audit = null
  if (tier1Score >= THRESHOLDS.review){
    model.tier2Calls++
    const res = await mcp.handle({ method:'tools/call', params:{ name:'audit_invoice', arguments:{ vendorId:inv.vendorId, amount:inv.amount, lineItems:inv.lineItems } } })
    audit = { engine:res.engine, findings:res.findings, trace:res.trace }
    for (const f of res.findings){
      const pts = f.severity==='high'?14:8; raw += pts
      factors.push({ id:'t2_'+f.item.slice(0,14).replace(/\W/g,'_'), name:`Contract Violation: ${f.item}`, severity:f.severity==='high'?1:0.6, weight:pts, contribution:pts, explain:`${f.verdict} — "${f.clause}"`, tier:2 })
    }
    if (res.trace && persist){
      db.prepare('INSERT INTO traces (ts,invoiceRef,vendor,totalMs,tokensIn,tokensOut,costUSD,spans,engine) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(Date.now(), inv.invoiceRef, res.trace.vendor, res.trace.totalMs, res.trace.tokens.in, res.trace.tokens.out, res.trace.costUSD, JSON.stringify(res.trace.spans), res.engine)
    }
  }
  const score = Math.min(100, Math.round(raw))
  let decision, action
  if (score>=THRESHOLDS.block){ decision='BLOCKED'; action='Payment run frozen — invoice quarantined and vendor flagged for procurement escalation' }
  else if (score>=THRESHOLDS.review){ decision='REVIEW'; action='Routed to Compliance Oversight Bureau — payment held pending auditor verdict' }
  else { decision='APPROVED'; action='Cleared for payment run — risk within tolerance' }

  ctx._st.ts.push(Date.now()); if (ctx._st.ts.length>60) ctx._st.ts.shift()
  ctx._st.seenRefs.add(inv.invoiceRef); vendorState.set(inv.vendorId, ctx._st)

  return { score, tier1Score, tier1Ms, decision, action, factors, audit, thresholds:{...THRESHOLDS} }
}

/* ── GAP 3+4: Evaluation harness — COMPUTES metrics on a labelled test set ── */
async function runEvaluation(n=400){
  const data = generate(n, 0.12)
  const pairs = []
  global.__FAST_EVAL = true                        // skip artificial Tier-2 latency in bulk eval
  for (const inv of data){
    const r = await scoreInvoice(inv, false)       // don't persist eval invoices
    pairs.push({ label: inv.label, score: r.score })
  }
  global.__FAST_EVAL = false
  const atBlock = evaluate(pairs, THRESHOLDS.block)
  const atReview = evaluate(pairs, THRESHOLDS.review)
  const result = {
    n, at:new Date().toISOString(),
    operating: atBlock,           // metrics at the block threshold
    reviewLevel: atReview,        // metrics at the review threshold
    auprc: atBlock.auprc,
  }
  db.prepare('INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)').run('lastEval', JSON.stringify(result))
  return result
}
function getLastEval(){ const r=db.prepare("SELECT v FROM meta WHERE k='lastEval'").get(); return r?JSON.parse(r.v):null }

/* ── GAP 4: feedback that VALIDATES itself (before/after precision) ── */
async function applyFeedback(factors, confirmedFraud, actor='auditor', invoiceId=null){
  // measure precision before
  const before = getLastEval()?.operating?.precision ?? null
  const delta = confirmedFraud ? +0.4 : -0.4
  for (const f of factors){
    if (f.tier!==1) continue
    weights[f.id] = Math.max(2, Math.min(30, +(weights[f.id]+delta*f.severity).toFixed(2)))
    saveWeight(f.id)
  }
  model.labeledSamples++; confirmedFraud?model.confirmedFraud++:model.falsePositives++
  model.lastAdjustment = new Date().toISOString(); saveModelMeta()
  // re-evaluate to prove the loop helps (or not)
  const evalAfter = await runEvaluation(300)
  const after = evalAfter.operating.precision
  db.prepare('INSERT INTO feedback_events (ts,actor,invoiceId,verdict,precisionBefore,precisionAfter) VALUES (?,?,?,?,?,?)')
    .run(new Date().toISOString(), actor, invoiceId, confirmedFraud?'fraud':'legit', before, after)
  return { before, after }
}
function getFeedbackHistory(){ return db.prepare('SELECT * FROM feedback_events ORDER BY id DESC LIMIT 20').all() }

function getModelInfo(){
  return {
    ...model, thresholds:{...THRESHOLDS},
    forest: forestMeta,
    rules: [...RULES.map(r=>({ id:r.id, name:r.name, baseWeight:r.weight, currentWeight:+(weights[r.id]||r.weight).toFixed(2) })),
            { id:'ml_anomaly', name:'Isolation Forest Anomaly', baseWeight:20, currentWeight:+(weights['ml_anomaly']||20).toFixed(2) }],
    mcpTools: mcp.TOOLS.map(t=>({ name:t.name, description:t.description })),
    evaluation: getLastEval(),
  }
}
function getTelemetry(){
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0
  const rows = db.prepare('SELECT * FROM traces ORDER BY id DESC LIMIT 40').all()
  const t2ms=rows.map(r=>r.totalMs), costs=rows.map(r=>r.costUSD)
  const toks=rows.reduce((a,r)=>({in:a.in+r.tokensIn,out:a.out+r.tokensOut}),{in:0,out:0})
  const totalInv = db.prepare('SELECT COUNT(*) n FROM invoices').get().n || tier1Lat.length
  return {
    tier1:{ avgMs:+avg(tier1Lat).toFixed(3), samples:tier1Lat.length },
    tier2:{ avgMs:+avg(t2ms).toFixed(1), calls:rows.length, avgCostUSD:+avg(costs).toFixed(6), totalCostUSD:+costs.reduce((a,b)=>a+b,0).toFixed(6), tokens:toks },
    escalationRate: totalInv ? +(rows.length/totalInv).toFixed(3) : 0,
    recentTraces: rows.slice(0,12).map(r=>({ invoiceRef:r.invoiceRef, vendor:r.vendor, totalMs:r.totalMs, costUSD:r.costUSD, tokens:{in:r.tokensIn,out:r.tokensOut}, spans:JSON.parse(r.spans) })),
  }
}

/* ── boot ── */
async function init(){
  loadWeights(); loadModelMeta(); loadThresholds()
  trainForest()   // rebuild in-memory forest each boot; metadata persists
  await runEvaluation(400)   // always compute fresh metrics against current weights
}

module.exports = { init, scoreInvoice, applyFeedback, getModelInfo, setThresholds, getTelemetry, trainForest, runEvaluation, getLastEval, getFeedbackHistory, THRESHOLDS }
