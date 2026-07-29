import { useState, useEffect, useRef, useCallback } from 'react'
import { api, auth } from './api'

const chipCls = s => s>=70?'sc-high':s>=40?'sc-mid':'sc-low'
const CN = {US:'United States',GB:'United Kingdom',DE:'Germany',CA:'Canada',AE:'UAE',PK:'Pakistan',IN:'India',CN:'China',BR:'Brazil',MX:'Mexico',RU:'Russia ⚠',NG:'Nigeria ⚠',IR:'Iran ⚠',KP:'North Korea ⚠',BY:'Belarus ⚠',VN:'Vietnam'}

function Gauge({ score }){
  const pct=score/100, angle=-180+pct*180
  const color=score>=70?'#f87171':score>=40?'#fbbf24':'#34d399'
  const R=90,CX=110,CY=110,rad=angle*Math.PI/180
  const x=CX+R*Math.cos(rad),y=CY+R*Math.sin(rad),large=pct>0.5?1:0
  return (
    <div className="gauge-wrap">
      <svg width="220" height="120" viewBox="0 0 220 120">
        <path d={`M ${CX-R} ${CY} A ${R} ${R} 0 0 1 ${CX+R} ${CY}`} fill="none" stroke="#0d1a30" strokeWidth="14" strokeLinecap="round"/>
        {score>0&&<path d={`M ${CX-R} ${CY} A ${R} ${R} 0 ${large} 1 ${x} ${y}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" style={{filter:`drop-shadow(0 0 9px ${color}77)`,transition:'all .6s'}}/>}
      </svg>
      <div className="gauge-score" style={{color}}>{score}</div>
      <div className="gauge-cap">Composite Risk / 100</div>
    </div>
  )
}
function Donut({ approved, review, blocked }){
  const total=Math.max(1,approved+review+blocked)
  const segs=[[approved,'#34d399'],[review,'#fbbf24'],[blocked,'#f87171']]
  let acc=0; const R=54,C=2*Math.PI*R
  return (
    <div className="donut-wrap">
      <svg width="150" height="150" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r={R} fill="none" stroke="#0d1a30" strokeWidth="16"/>
        {segs.map(([v,c],i)=>{const frac=v/total,off=C*(1-acc/total),dash=`${C*frac} ${C*(1-frac)}`;acc+=v
          return v>0&&<circle key={i} cx="75" cy="75" r={R} fill="none" stroke={c} strokeWidth="16" strokeDasharray={dash} strokeDashoffset={off} transform="rotate(-90 75 75)" style={{transition:'all .5s'}}/>})}
        <text x="75" y="70" textAnchor="middle" fill="#dbeafe" fontFamily="Space Grotesk" fontWeight="800" fontSize="24">{total}</text>
        <text x="75" y="88" textAnchor="middle" fill="#43587c" fontSize="9" fontWeight="700" letterSpacing="1">INVOICES</text>
      </svg>
      <div className="legend">
        <div className="leg"><i style={{background:'#34d399'}}/>Cleared <b>{approved}</b></div>
        <div className="leg"><i style={{background:'#fbbf24'}}/>Compliance Hold <b>{review}</b></div>
        <div className="leg"><i style={{background:'#f87171'}}/>Quarantined <b>{blocked}</b></div>
      </div>
    </div>
  )
}

/* ══ DASHBOARD ══ */
function Dashboard({ go }){
  const [s,setS]=useState(null)
  const load=useCallback(()=>api.stats().then(setS).catch(()=>{}),[])
  useEffect(()=>{load();const t=setInterval(load,3000);return()=>clearInterval(t)},[load])
  if(!s) return null
  const threatPct=s.total?(s.blocked+s.review)/s.total:0
  const lvl=threatPct>0.35?'high':threatPct>0.15?'med':'low'
  const maxF=Math.max(1,...(s.topFactors||[]).map(f=>f[1]))
  const maxV=Math.max(1,...(s.hotVendors||[]).map(c=>c[1]))
  return (<>
    <div className={`threat ${lvl}`}>
      <div className="threat-ring">{lvl==='high'?'🚨':lvl==='med'?'⚠️':'🛡️'}</div>
      <div>
        <div className="threat-t">AP Risk Posture: {lvl==='high'?'ELEVATED':lvl==='med'?'MODERATE':'NOMINAL'}</div>
        <div className="threat-d">{s.total===0?'No invoice traffic yet — start the Live Monitor stream to see the engine work.':`${Math.round(threatPct*100)}% of accounts-payable traffic flagged · $${(s.amountAtRisk||0).toLocaleString()} in fraudulent invoices quarantined · ${s.tier2||0} Tier-2 deep audits run · ${s.violations||0} contract violations found`}</div>
      </div>
      {s.total===0&&<button className="btn-sm primary" style={{marginLeft:'auto'}} onClick={()=>go('monitor')}>▶ Start Stream</button>}
    </div>
    <div className="stats">
      <div className="stat" style={{'--c':'#22d3ee'}}><div className="stat-l">Invoices Processed</div><div className="stat-v">{s.total}</div><div className="stat-d">scored end-to-end</div></div>
      <div className="stat" style={{'--c':'#34d399'}}><div className="stat-l">Cleared</div><div className="stat-v" style={{color:'#6ee7b7'}}>{s.approved}</div><div className="stat-d">Tier-1 pass</div></div>
      <div className="stat" style={{'--c':'#818cf8'}}><div className="stat-l">Deep Audits</div><div className="stat-v" style={{color:'#a5b4fc'}}>{s.tier2||0}</div><div className="stat-d">Tier-2 MCP calls</div></div>
      <div className="stat" style={{'--c':'#f87171'}}><div className="stat-l">Quarantined</div><div className="stat-v" style={{color:'#fca5a5'}}>{s.blocked}</div><div className="stat-d">payment frozen</div></div>
      <div className="stat" style={{'--c':'#fbbf24'}}><div className="stat-l">$ Protected</div><div className="stat-v">${((s.amountAtRisk||0)/1000).toFixed(1)}k</div><div className="stat-d">fraud value stopped</div></div>
    </div>
    <div className="g2" style={{marginBottom:16}}>
      <div className="card">
        <div className="card-h"><div><div className="card-t">Payment Router Split</div><div className="card-s">How the decision router handled AP traffic</div></div></div>
        <div className="card-b"><Donut approved={s.approved} review={s.review} blocked={s.blocked}/></div>
      </div>
      <div className="card">
        <div className="card-h"><div><div className="card-t">Risk Score Distribution</div><div className="card-s">Bucketed 0–100 across all invoices</div></div></div>
        <div className="card-b">
          {['0–19','20–39','40–59','60–79','80–100'].map((lbl,i)=>{
            const max=Math.max(1,...s.buckets)
            return <div className="hrow" key={lbl}><span style={{fontFamily:'var(--fm)',fontSize:11.5}}>{lbl}</span><div className="hbar"><div className={i>=2?'warn':''} style={{width:`${(s.buckets[i]/max)*100}%`}}/></div><span className="hval">{s.buckets[i]}</span></div>})}
        </div>
      </div>
    </div>
    <div className="g2">
      <div className="card">
        <div className="card-h"><div><div className="card-t">Most Triggered Signals</div><div className="card-s">Tier-1 rules + Tier-2 contract findings</div></div></div>
        <div className="card-b">
          {(s.topFactors||[]).length===0?<div className="no-factors">Run traffic to populate.</div>:
            s.topFactors.map(([name,n])=><div className="hrow" key={name} style={{gridTemplateColumns:'210px 1fr 34px'}}><span style={{fontSize:11.5}}>{name}</span><div className="hbar"><div className="warn" style={{width:`${(n/maxF)*100}%`}}/></div><span className="hval">{n}</span></div>)}
        </div>
      </div>
      <div className="card">
        <div className="card-h"><div><div className="card-t">High-Risk Vendors</div><div className="card-s">Who is generating flagged invoices</div></div></div>
        <div className="card-b">
          {(s.hotVendors||[]).length===0?<div className="no-factors">No flagged invoices yet.</div>:
            s.hotVendors.map(([v,n])=><div className="hrow" key={v} style={{gridTemplateColumns:'170px 1fr 34px'}}><span style={{fontSize:12}}>{v}</span><div className="hbar"><div className="warn" style={{width:`${(n/maxV)*100}%`}}/></div><span className="hval">{n}</span></div>)}
          {(s.highRisk||[]).length>0&&<>
            <div style={{fontSize:10,fontWeight:800,color:'var(--muted2)',textTransform:'uppercase',letterSpacing:'.09em',margin:'16px 0 8px'}}>Latest critical invoices</div>
            {s.highRisk.map(t=><div key={t.id} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
              <span>{t.vendorName} · ${t.amount.toLocaleString()} · {t.invoiceRef}</span>
              <span className={`score-chip ${chipCls(t.score)}`} style={{padding:'1px 10px'}}>{t.score}</span></div>)}
          </>}
        </div>
      </div>
    </div>
  </>)
}

/* ══ SANDBOX ══ */
function Sandbox(){
  const [vendors,setVendors]=useState([])
  const [lineItems,setLineItems]=useState({})
  const [form,setForm]=useState({vendorId:'VND-101',amount:2600,hour:11,shipFrom:'DE',duplicate:false,items:[]})
  const [result,setResult]=useState(null)
  const [loading,setLoading]=useState(false)
  const [showContract,setShowContract]=useState(false)
  useEffect(()=>{ api.vendors().then(setVendors); api.lineItems().then(setLineItems) },[])
  const vendor = vendors.find(v=>v.id===form.vendorId)
  const set=(k,v)=>setForm(f=>({...f,[k]:v}))
  const toggleItem=id=>setForm(f=>({...f,items:f.items.includes(id)?f.items.filter(x=>x!==id):[...f.items,id]}))
  const run=async()=>{
    setLoading(true)
    try{ setResult(await api.score({vendorId:form.vendorId,amount:form.amount,hour:form.hour,shipFrom:form.shipFrom,duplicate:form.duplicate,lineItems:form.items})) }
    catch{ alert('Backend not reachable') }
    setLoading(false)
  }
  const loadAttack=async(kind)=>{
    let f
    if(kind==='clean') f={vendorId:'VND-101',amount:2600,hour:11,shipFrom:'DE',duplicate:false,items:[]}
    if(kind==='padding') f={vendorId:'VND-101',amount:4200,hour:14,shipFrom:'DE',duplicate:false,items:['fuel_surcharge','expedite_fee']}
    if(kind==='shell') f={vendorId:'VND-106',amount:12000,hour:3,shipFrom:'RU',duplicate:true,items:['lump_sum_fee','misc_admin_fee']}
    setForm(f)
    setLoading(true)
    try{ setResult(await api.score({vendorId:f.vendorId,amount:f.amount,hour:f.hour,shipFrom:f.shipFrom,duplicate:f.duplicate,lineItems:f.items})) }catch{}
    setLoading(false)
  }
  return (
    <div className="sandbox">
      <div className="card">
        <div className="card-h"><div><div className="card-t">Invoice Builder</div><div className="card-s">Craft an invoice — or load a known fraud pattern</div></div></div>
        <div className="card-b">
          <div className="presets">
            {[['clean','📄','Clean Invoice'],['padding','🧾','Invoice Padding'],['shell','🏚️','Shell Vendor']].map(([k,i,l])=>(
              <div className="preset" key={k} onClick={()=>loadAttack(k)}><div className="pi">{i}</div><div className="pn">{l}</div></div>))}
          </div>
          <div className="field"><div className="flbl"><span>Vendor</span></div>
            <select className="fsel" value={form.vendorId} onChange={e=>set('vendorId',e.target.value)}>
              {vendors.map(v=><option key={v.id} value={v.id}>{v.name} — {v.category.replace('_',' ')}</option>)}
            </select>
            {vendor&&<div style={{fontSize:11,color:'var(--muted2)',marginTop:5}}>Avg invoice ${vendor.avgInvoice.toLocaleString()} · bills from {CN[vendor.homeCountry]||vendor.homeCountry} · onboarded {vendor.onboardedDays}d ago · <span style={{color:'#67e8f9',cursor:'pointer'}} onClick={()=>setShowContract(s=>!s)}>{showContract?'hide':'view'} contract</span></div>}
            {showContract&&vendor&&<div className="contract-box">{vendor.contract}</div>}
          </div>
          <div className="field"><div className="flbl"><span>Invoice Amount</span><b>${form.amount.toLocaleString()}</b></div>
            <input type="range" min="200" max="60000" step="100" value={form.amount} onChange={e=>set('amount',+e.target.value)}/></div>
          <div className="field"><div className="flbl"><span>Ship-From Jurisdiction</span></div>
            <select className="fsel" value={form.shipFrom} onChange={e=>set('shipFrom',e.target.value)}>
              {Object.entries(CN).map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select></div>
          <div className="field"><div className="flbl"><span>Submission Time</span><b>{String(form.hour).padStart(2,'0')}:00</b></div>
            <input type="range" min="0" max="23" value={form.hour} onChange={e=>set('hour',+e.target.value)}/></div>
          <div className="toggle-row"><span>Resubmit duplicate invoice ID</span><button className={`tg ${form.duplicate?'on':''}`} onClick={()=>set('duplicate',!form.duplicate)}/></div>
          <div className="flbl" style={{marginTop:14,marginBottom:7}}><span>Add-On Line Items <span style={{color:'var(--muted2)'}}>(audited against contract)</span></span></div>
          {Object.entries(lineItems).map(([id,li])=>(
            <div key={id} className={`li-chip ${form.items.includes(id)?'on':''}`} onClick={()=>toggleItem(id)}>
              <span>{form.items.includes(id)?'☑':'☐'} {li.label}</span><b>${li.amount}</b>
            </div>))}
          <button className="btn-score" style={{marginTop:12}} onClick={run} disabled={loading}>{loading?'Running two-tier audit…':'⚡ Submit for Audit'}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-h"><div><div className="card-t">Hybrid Audit Result</div><div className="card-s">Tier-1 statistical filter → Tier-2 contract agent</div></div></div>
        <div className="card-b">
          {!result?(
            <div className="no-factors" style={{padding:'80px 24px'}}>
              <div style={{fontSize:36,marginBottom:12}}>🛡️</div>
              Build an invoice — or load a <b style={{color:'#67e8f9'}}>fraud pattern</b> — and submit it.<br/>
              Tier-1 scores it statistically in microseconds; anything suspicious is escalated to the <b style={{color:'#a5b4fc'}}>Tier-2 agent</b>, which reads the vendor's actual contract and audits every line item.
            </div>
          ):(<>
            <Gauge score={result.score}/>
            <div className={`decision ${result.decision}`}>
              <div className="dec-badge">{result.decision==='REVIEW'?'⚠ HOLD':result.decision==='BLOCKED'?'⛔ QUARANTINED':'✓ CLEARED'}</div>
              <div className="dec-action">{result.action}</div>
            </div>
            {result.audit&&<div className="audit-banner">🤖 Tier-2 Deep Audit fired — <b>audit_invoice</b> tool called via MCP · engine: {result.audit.engine==='claude-llm'?'Claude LLM':'clause-matcher agent'} · {result.audit.findings.length} contract violation(s) found · Tier-1 alone scored {result.tier1Score}</div>}
            <div style={{fontSize:10,fontWeight:800,color:'var(--muted2)',textTransform:'uppercase',letterSpacing:'.09em',margin:'14px 0 9px'}}>Signals ({result.factors.length})</div>
            {result.factors.length===0
              ?<div className="no-factors">Clean profile — nothing triggered.</div>
              :result.factors.map(f=>(
                <div className={`factor ${f.tier===2?'tier2':''}`} key={f.id}>
                  <div className="factor-top"><span className="factor-name">{f.name}<span className={`tier-tag ${f.tier===2?'t2':'t1'}`}>TIER {f.tier}</span></span><span className="factor-pts">+{f.contribution} pts</span></div>
                  <div className="factor-exp">{f.explain}</div>
                  <div className="fbar"><div style={{width:`${f.severity*100}%`}}/></div>
                </div>))}
            <div className="thr-note">Router: &lt; {result.thresholds.review} clear · {result.thresholds.review}–{result.thresholds.block-1} compliance hold · ≥ {result.thresholds.block} quarantine</div>
          </>)}
        </div>
      </div>
    </div>
  )
}

/* ══ MONITOR ══ */
function Monitor(){
  const [txns,setTxns]=useState([]); const [filter,setFilter]=useState('ALL')
  const [running,setRunning]=useState(false); const timer=useRef(null)
  const refresh=useCallback(()=>api.txns(60).then(setTxns).catch(()=>{}),[])
  useEffect(()=>{refresh()},[refresh])
  useEffect(()=>{
    if(running) timer.current=setInterval(async()=>{await api.simulate();refresh()},1500)
    return()=>clearInterval(timer.current)
  },[running,refresh])
  const burst=async()=>{for(let i=0;i<10;i++)await api.simulate();refresh()}
  const shown=txns.filter(t=>filter==='ALL'||t.decision===filter)
  return (
    <div className="card">
      <div className="card-h">
        <div><div className="card-t">Accounts-Payable Invoice Stream</div><div className="card-s">Every incoming invoice scored by the two-tier engine</div></div>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <div className="filters">{['ALL','APPROVED','REVIEW','BLOCKED'].map(f=><button key={f} className={`fchip ${filter===f?'on':''}`} onClick={()=>setFilter(f)}>{f==='APPROVED'?'CLEARED':f==='REVIEW'?'HOLD':f==='BLOCKED'?'QUARANTINE':'ALL'}</button>)}</div>
          <button className="btn-sm" onClick={burst}>+10 Burst</button>
          <button className={`btn-sm ${running?'':'primary'}`} onClick={()=>setRunning(r=>!r)}>{running?'⏸ Pause':'▶ Start Stream'}</button>
        </div>
      </div>
      <div style={{maxHeight:600,overflowY:'auto'}}>
        {shown.length===0&&<div className="no-factors" style={{padding:50}}>No invoices{filter!=='ALL'?' matching filter':''} — press <b style={{color:'#67e8f9'}}>Start Stream</b>.</div>}
        {shown.map(t=>(
          <div className="txn-row" key={t.id}>
            <span className="txn-id">{t.invoiceRef}</span>
            <div><div className="txn-user">{t.vendorName}{t.audit&&<span className="tier-tag t2">T2 AUDIT</span>}</div>
              <div className="txn-meta">{t.category.replace('_',' ')} · ships {t.shipFrom} · {String(t.hour).padStart(2,'0')}:00{t.lineItems.length?` · ${t.lineItems.length} add-on(s)`:''}</div></div>
            <span className="txn-amt">${t.amount.toLocaleString()}</span>
            <span className={`score-chip ${chipCls(t.score)}`}>{t.score}</span>
            <span className={`dchip ${t.decision}`}>{t.decision==='APPROVED'?'CLEARED':t.decision==='REVIEW'?'HOLD':'QUARANTINE'}</span>
          </div>))}
      </div>
    </div>
  )
}

/* ══ REVIEW (Compliance Oversight Bureau) ══ */
function ReviewQueue(){
  const [queue,setQueue]=useState([]); const [labelled,setLabelled]=useState(0)
  const load=()=>api.queue().then(setQueue).catch(()=>{})
  useEffect(()=>{load()},[])
  const [lastVal,setLastVal]=useState(null)
  const decide=async(id,fraud)=>{ try{
    const r=await api.review(id,fraud)
    if(r.validation) setLastVal(r.validation)
    setLabelled(n=>n+1); load() }catch(err){ alert(err.message || 'Failed to submit verdict') }
  }
  return (<>
    <div className="card" style={{marginBottom:16}}>
      <div className="card-b" style={{display:'flex',gap:18,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{fontSize:28}}>🏛️</div>
        <div style={{flex:1,minWidth:280}}>
          <div style={{fontWeight:800,fontSize:14,marginBottom:3}}>Compliance Oversight Bureau — Human-in-the-Loop</div>
          <div style={{fontSize:12.5,color:'var(--muted)',lineHeight:1.65}}>
            Invoices on compliance hold await an auditor verdict. Each verdict becomes a <b style={{color:'#67e8f9'}}>training label</b> — Tier-1 rule weights adapt online. Watch them shift in <b style={{color:'#67e8f9'}}>Model & Tuning</b>.
          </div>
        </div>
        <div className="metric-big" style={{minWidth:130}}><b>{labelled}</b><span>Verdicts this session</span></div>
      </div>
    </div>
    {lastVal&&<div className="audit-banner" style={{marginBottom:16}}>📏 Feedback validated — model precision re-measured: <b>{lastVal.before!=null?lastVal.before.toFixed(3):'n/a'}</b> → <b>{lastVal.after.toFixed(3)}</b> on the labelled test set after this verdict updated the weights.</div>}
    {queue.length===0
      ?<div className="card"><div className="no-factors" style={{padding:56}}>Queue empty — run the <b style={{color:'#67e8f9'}}>Live Monitor</b> stream to generate holds.</div></div>
      :queue.map(q=>(
        <div className="rq-item" key={q.id}>
          <div className="rq-top">
            <div>
              <div style={{fontWeight:800,fontSize:14}}>{q.vendorName} — ${q.amount.toLocaleString()} <span style={{fontFamily:'var(--fm)',fontSize:10.5,color:'var(--muted2)',marginLeft:6}}>{q.invoiceRef}</span>{q.audit&&<span className="tier-tag t2">T2 AUDITED</span>}</div>
              <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{q.category.replace('_',' ')} · ships from {CN[q.shipFrom]||q.shipFrom} · {String(q.hour).padStart(2,'0')}:00</div>
            </div>
            <span className={`score-chip ${chipCls(q.score)}`} style={{fontSize:14,padding:'4px 13px'}}>{q.score}</span>
          </div>
          <div className="rq-factors">{q.factors.slice(0,4).map(f=><div key={f.id}>• {f.explain.split(' — "')[0]} <b style={{color:f.tier===2?'#a5b4fc':'#f87171'}}>(+{f.contribution})</b></div>)}</div>
          <div className="rq-actions">
            <button className="btn-legit" onClick={()=>decide(q.id,false)}>✓ Compliant — release payment</button>
            <button className="btn-fraud" onClick={()=>decide(q.id,true)}>⛔ Confirmed fraud — quarantine vendor</button>
          </div>
        </div>))}
  </>)
}

/* ══ MODEL ══ */
function ModelPage(){
  const [m,setM]=useState(null); const [thr,setThr]=useState(null)
  useEffect(()=>{
    const load=()=>api.model().then(d=>{setM(d);setThr(t=>t||{review:d.thresholds.review,block:d.thresholds.block})}).catch(()=>{})
    load(); const t=setInterval(load,3500); return()=>clearInterval(t)
  },[])
  if(!m||!thr) return <div className="card"><div className="no-factors" style={{padding:56}}>Loading model & tuning data…</div></div>
  const maxW=Math.max(...m.rules.map(r=>r.currentWeight))
  return (
    <div className="g2">
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div className="card">
          <div className="card-h"><div className="card-t">Hybrid Two-Tier Pipeline</div></div>
          <div className="card-b">
            {[['01','Ingestion','B2B invoices enter the AP stream — simulated here, message queue (Kafka) in production.'],
              ['02','Tier 1 — Statistical Filter','Low-latency checks on every invoice: price z-score vs vendor baseline, duplicate IDs, velocity, geo mismatch. Microsecond-class, runs on 100% of traffic.'],
              ['03','Tier 2 — MCP Contract Agent','Flagged invoices escalate to an MCP orchestration: fetch_pdf_contract_terms pulls the unstructured contract, fetch_historical_line_items pulls the vendor\'s 12-month billing profile, then the LLM Auditor Agent audits every line item against both — citing exact clauses. Every span is traced.'],
              ['04','Decision Router','Composite score routes each invoice: clear for payment, compliance hold + auditor review, or quarantine.'],
              ['05','Calibration Loop','Auditor verdicts are labels — Tier-1 weights adapt online so the system learns each company\'s fraud landscape.'],
            ].map(([n,t,d])=><div className="pstep" key={n}><div className="pnum">{n}</div><div><div className="ptitle">{t}</div><div className="pdesc">{d}</div></div></div>)}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><div><div className="card-t">MCP Server Tools</div><div className="card-s">Advertised via tools/list — POST /mcp is a live JSON-RPC surface</div></div></div>
          <div className="card-b">
            {m.mcpTools?.map(t=>(
              <div key={t.name} style={{padding:'10px 13px',borderRadius:9,background:'var(--bg3)',border:'1px solid var(--border)',marginBottom:8}}>
                <div style={{fontFamily:'var(--fm)',fontSize:12.5,fontWeight:700,color:'#a5b4fc'}}>{t.name}</div>
                <div style={{fontSize:11.5,color:'var(--muted)'}}>{t.description}</div>
              </div>))}
            <div className="thr-note">Tier-2 engine: <b style={{color:'#a5b4fc'}}>{m.tier2Calls}</b> audit calls so far. With ANTHROPIC_API_KEY set, audits run through Claude; otherwise a deterministic clause-matcher agent performs the same audit.</div>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><div><div className="card-t">Decision Thresholds</div><div className="card-s">Tune the router live</div></div></div>
          <div className="card-b">
            <div className="field"><div className="flbl"><span>Compliance-hold threshold</span><b>{thr.review}</b></div>
              <input type="range" min="10" max={thr.block-5} value={thr.review} onChange={e=>setThr(t=>({...t,review:+e.target.value}))}/></div>
            <div className="field"><div className="flbl"><span>Quarantine threshold</span><b>{thr.block}</b></div>
              <input type="range" min={thr.review+5} max="95" value={thr.block} onChange={e=>setThr(t=>({...t,block:+e.target.value}))}/></div>
            <button className="btn-sm primary" style={{width:'100%',padding:11}} onClick={()=>api.thresholds(thr).catch(err=>alert(err.message||'Failed to apply thresholds'))}>Apply Thresholds</button>
            <div className="thr-note">Stricter thresholds = tighter security but more vendor friction and auditor workload — the core tuning trade-off in every AP fraud team.</div>
          </div>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div className="card">
          <div className="card-h"><div><div className="card-t">Adaptive Tier-1 Weights — v{m.version}</div><div className="card-s">{m.labeledSamples} verdicts · {m.confirmedFraud} fraud · {m.falsePositives} false positives</div></div></div>
          <div className="card-b">
            {m.rules.map(r=>(
              <div className="wrow" key={r.id}>
                <span style={{fontSize:12}}>{r.name}</span>
                <span style={{fontFamily:'var(--fm)',fontWeight:800,color:r.currentWeight>r.baseWeight?'#f87171':r.currentWeight<r.baseWeight?'#6ee7b7':'var(--muted)'}}>{r.currentWeight}</span>
                <div className="wbar"><div style={{width:`${(r.currentWeight/maxW)*100}%`}}/></div>
              </div>))}
            <div className="thr-note"><span style={{color:'#f87171'}}>Red</span> rose after confirmed fraud · <span style={{color:'#6ee7b7'}}>green</span> fell after false positives.</div>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><div><div className="card-t">Backtest Metrics</div><div className="card-s">{(m.evaluation?`Computed on ${m.evaluation.n} labelled invoices at threshold ${m.evaluation.operating.threshold}`:'No evaluation yet')}</div></div></div>
          <div className="card-b" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
            <div className="metric-big"><b>{(m.evaluation?m.evaluation.operating.precision.toFixed(3):'—')}</b><span>Precision</span></div>
            <div className="metric-big"><b>{(m.evaluation?m.evaluation.operating.recall.toFixed(3):'—')}</b><span>Recall</span></div>
            <div className="metric-big"><b>{(m.evaluation?m.evaluation.auprc.toFixed(3):'—')}</b><span>AUPRC</span></div>
            <div className="metric-big"><b>{(m.evaluation?m.evaluation.operating.f1.toFixed(3):'—')}</b><span>F1</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}


/* ══ OBSERVABILITY ══ */
function Observability(){
  const [t,setT]=useState(null)
  useEffect(()=>{
    const load=()=>api.telemetry().then(setT).catch(()=>{})
    load(); const i=setInterval(load,3000); return()=>clearInterval(i)
  },[])
  if(!t) return <div className="card"><div className="no-factors" style={{padding:56}}>Loading observability data…</div></div>
  const t1=t.tier1.avgMs, t2=t.tier2.avgMs
  const maxMs=Math.max(t2,1)
  const spanColor={fetch_pdf_contract_terms:'#22d3ee',fetch_historical_line_items:'#2dd4bf',llm_auditor_agent:'#818cf8'}
  return (<>
    <div className="stats">
      <div className="stat" style={{'--c':'#22d3ee'}}><div className="stat-l">Tier-1 Avg Latency</div><div className="stat-v">{t1<1?(t1*1000).toFixed(0)+'μs':t1.toFixed(1)+'ms'}</div><div className="stat-d">{t.tier1.samples} invoices sampled</div></div>
      <div className="stat" style={{'--c':'#818cf8'}}><div className="stat-l">Tier-2 Avg Latency</div><div className="stat-v" style={{color:'#a5b4fc'}}>{t2.toFixed(0)}ms</div><div className="stat-d">{t.tier2.calls} deep audits traced</div></div>
      <div className="stat" style={{'--c':'#fbbf24'}}><div className="stat-l">Escalation Rate</div><div className="stat-v" style={{color:'#fcd34d'}}>{Math.round(t.escalationRate*100)}%</div><div className="stat-d">of traffic reaches Tier-2</div></div>
      <div className="stat" style={{'--c':'#34d399'}}><div className="stat-l">Cost / Audit</div><div className="stat-v" style={{color:'#6ee7b7'}}>${t.tier2.avgCostUSD.toFixed(4)}</div><div className="stat-d">avg per Tier-2 call</div></div>
      <div className="stat" style={{'--c':'#f87171'}}><div className="stat-l">Total LLM Spend</div><div className="stat-v">${t.tier2.totalCostUSD.toFixed(4)}</div><div className="stat-d">{t.tier2.tokens.in.toLocaleString()} in · {t.tier2.tokens.out.toLocaleString()} out tokens</div></div>
    </div>
    <div className="g2">
      <div className="card">
        <div className="card-h"><div><div className="card-t">The Cost / Latency Funnel</div><div className="card-s">Why Tier-1 exists — compute saved by filtering before the LLM</div></div></div>
        <div className="card-b">
          <div className="funnel">
            <div className="frow"><span className="fl">Tier 1 · Statistical</span>
              <div className="fbar2"><div style={{width:`${Math.max(4,(t1/maxMs)*100)}%`,background:'linear-gradient(90deg,#0891b2,#22d3ee)'}}>{t1<1?(t1*1000).toFixed(0)+'μs':t1.toFixed(1)+'ms'}</div></div>
              <span className="fv" style={{color:'#67e8f9'}}>100% traffic</span></div>
            <div className="frow"><span className="fl">Tier 2 · LLM Agent</span>
              <div className="fbar2"><div style={{width:'100%',background:'linear-gradient(90deg,#6366f1,#818cf8)'}}>{t2.toFixed(0)}ms</div></div>
              <span className="fv" style={{color:'#a5b4fc'}}>{Math.round(t.escalationRate*100)}% traffic</span></div>
          </div>
          <div className="thr-note" style={{marginTop:16}}>
            Tier-1 is ~{t2&&t1?Math.round(t2/Math.max(t1,0.001)).toLocaleString():'—'}× faster than Tier-2. Routing only {Math.round(t.escalationRate*100)}% of invoices to the LLM cuts token spend by ~{100-Math.round(t.escalationRate*100)}% versus auditing everything — the core economics of tiered AI inference.
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-h"><div><div className="card-t">Tier-2 Trace Waterfall</div><div className="card-s">Per-span timing of every MCP orchestration — LangSmith-style</div></div></div>
        <div className="card-b" style={{maxHeight:460,overflowY:'auto'}}>
          {t.recentTraces.length===0
            ? <div className="no-factors">No Tier-2 audits yet — run the Live Monitor or a risky Sandbox invoice.</div>
            : t.recentTraces.map((tr,i)=>{
              const total=Math.max(tr.totalMs,1)
              return (
                <div className="trace" key={i}>
                  <div className="trace-h">
                    <span><b>{tr.invoiceRef}</b> · {tr.vendor}</span>
                    <span style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span className="cost-tag">${(tr.costUSD||0).toFixed(4)}</span>
                      <b style={{color:'var(--muted)'}}>{tr.totalMs.toFixed(0)}ms</b>
                    </span>
                  </div>
                  {tr.spans.map(sp=>(
                    <div className="span-row" key={sp.tool}>
                      <span style={{fontFamily:'var(--fm)',fontSize:10.5}}>{sp.tool}{sp.engine?` (${sp.engine})`:''}</span>
                      <div className="span-bar"><div style={{width:`${Math.max(2,(sp.ms/total)*100)}%`,background:spanColor[sp.tool]||'#22d3ee'}}/></div>
                      <span style={{fontFamily:'var(--fm)',textAlign:'right'}}>{sp.ms<1?sp.ms.toFixed(2):sp.ms.toFixed(0)}ms</span>
                    </div>))}
                </div>)})}
        </div>
      </div>
    </div>
  </>)
}


/* ══ LOGIN GATE ══ */
function Login({ onLogin }){
  const [u,setU]=useState(''); const [p,setP]=useState(''); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false)
  const submit=async()=>{
    setBusy(true); setErr('')
    try{
      const r=await api.login(u,p)
      if(r.token){ auth.set(r.token); auth.setUser(r.user); onLogin(r.user) }
      else setErr(r.error||'Login failed')
    }catch(err){ setErr(err.message || 'Cannot reach server') }
    setBusy(false)
  }
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-top">
          <div className="login-icon">🛡️</div>
          <div className="login-title">Audexa</div>
          <div className="login-sub">ERP Fraud Engine · Compliance Console</div>
        </div>
        <div className="login-body">
          <label className="login-lbl">Username</label>
          <input className="login-inp" value={u} onChange={e=>setU(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="auditor"/>
          <label className="login-lbl">Password</label>
          <input className="login-inp" type="password" value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="••••••••"/>
          {err&&<div className="login-err">{err}</div>}
          <button className="login-btn" onClick={submit} disabled={busy}>{busy?'Authenticating…':'Sign In'}</button>
          <div className="login-demo">
            Demo accounts:<br/>
            <b>auditor / audit123</b> — review verdicts<br/>
            <b>admin / admin123</b> — tuning, retrain, audit log
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══ EVALUATION ══ */
function Evaluation(){
  const [e,setE]=useState(null); const [busy,setBusy]=useState(false)
  const load=()=>api.evaluation().then(setE).catch(()=>{})
  useEffect(()=>{load()},[])
  const rerun=async()=>{ setBusy(true); try{ const r=await api.evaluate(500); setE(r) }catch(err){ alert(err.message || 'Failed to re-run evaluation') } setBusy(false) }
  if(!e) return <div className="card"><div className="no-factors" style={{padding:56}}>No evaluation yet.</div></div>
  const o=e.operating
  return (<>
    <div className="card" style={{marginBottom:16}}>
      <div className="card-b" style={{display:'flex',gap:18,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{fontSize:28}}>📏</div>
        <div style={{flex:1,minWidth:280}}>
          <div style={{fontWeight:800,fontSize:14,marginBottom:3}}>Computed on a labelled test set — not hardcoded</div>
          <div style={{fontSize:12.5,color:'var(--muted)',lineHeight:1.65}}>
            The engine scored <b style={{color:'#67e8f9'}}>{e.n}</b> synthetic invoices with known ground-truth fraud labels. Every metric below is measured against those labels at the current block threshold ({o.threshold}). Last run {new Date(e.at).toLocaleString()}.
          </div>
        </div>
        <button className="btn-sm primary" onClick={rerun} disabled={busy}>{busy?'Running…':'Re-run Evaluation'}</button>
      </div>
    </div>
    <div className="g2">
      <div className="card">
        <div className="card-h"><div><div className="card-t">Confusion Matrix</div><div className="card-s">Predictions vs ground truth at threshold {o.threshold}</div></div></div>
        <div className="card-b">
          <div className="cm-grid">
            <div className="cm-cell tp"><div className="cm-v" style={{color:'#6ee7b7'}}>{o.tp}</div><div className="cm-l">True Positive</div></div>
            <div className="cm-cell fp"><div className="cm-v" style={{color:'#fcd34d'}}>{o.fp}</div><div className="cm-l">False Positive</div></div>
            <div className="cm-cell fn"><div className="cm-v" style={{color:'#fca5a5'}}>{o.fn}</div><div className="cm-l">False Negative</div></div>
            <div className="cm-cell tn"><div className="cm-v" style={{color:'#67e8f9'}}>{o.tn}</div><div className="cm-l">True Negative</div></div>
          </div>
          <div className="thr-note" style={{marginTop:16,textAlign:'center'}}>
            {o.tp+o.fn} actual fraud cases in {e.n} invoices ({Math.round((o.tp+o.fn)/e.n*100)}% base rate — realistic imbalance)
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-h"><div><div className="card-t">Classification Metrics</div><div className="card-s">Standard fraud-detection scorecard</div></div></div>
        <div className="card-b">
          <div className="eval-metrics">
            <div className="metric-big"><b>{o.precision.toFixed(3)}</b><span>Precision</span></div>
            <div className="metric-big"><b>{o.recall.toFixed(3)}</b><span>Recall</span></div>
            <div className="metric-big"><b>{o.f1.toFixed(3)}</b><span>F1</span></div>
            <div className="metric-big"><b>{e.auprc.toFixed(3)}</b><span>AUPRC</span></div>
          </div>
          <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.8}}>
            <div><b style={{color:'#6ee7b7'}}>Precision {o.precision.toFixed(3)}</b> — of invoices we blocked, this fraction were truly fraud (few false alarms).</div>
            <div><b style={{color:'#fcd34d'}}>Recall {o.recall.toFixed(3)}</b> — of all real fraud, this fraction we caught at the block threshold.</div>
            <div><b style={{color:'#a5b4fc'}}>AUPRC {e.auprc.toFixed(3)}</b> — area under the precision-recall curve; the right metric for rare-fraud imbalance.</div>
          </div>
          <div className="thr-note" style={{marginTop:14}}>Lower the block threshold in Model &amp; Tuning to trade precision for recall — the metrics recompute against the same labelled set.</div>
        </div>
      </div>
    </div>
  </>)
}

/* ══ AUDIT LOG ══ */
function AuditLog(){
  const [d,setD]=useState(null)
  useEffect(()=>{ api.auditLog().then(setD).catch(()=>setD({error:true})) },[])
  if(!d) return <div className="card"><div className="no-factors" style={{padding:56}}>Loading…</div></div>
  if(d.error||!d.entries) return <div className="card"><div className="no-factors" style={{padding:56}}>Admin login required to view the audit log.</div></div>
  return (
    <div className="card">
      <div className="card-h">
        <div><div className="card-t">Immutable Audit Trail</div><div className="card-s">Every verdict, tuning change, and login — SHA-256 hash-chained</div></div>
        <span className="integ-ok">🔒 {d.integrity.valid?`Chain verified · ${d.integrity.checkedEntries} entries`:'⚠ CHAIN BROKEN'}</span>
      </div>
      <div style={{maxHeight:560,overflowY:'auto'}}>
        <div className="audit-row" style={{fontWeight:700,color:'var(--muted2)',fontSize:10.5,textTransform:'uppercase',letterSpacing:'.06em'}}>
          <span>Timestamp</span><span>Action</span><span>Actor · Target · Hash</span>
        </div>
        {d.entries.map(en=>(
          <div className="audit-row" key={en.id}>
            <span className="audit-ts">{new Date(en.ts).toLocaleString()}</span>
            <span className={`audit-action ${en.action.includes('fraud')||en.action.includes('fail')?'danger':''}`}>{en.action}</span>
            <div>
              <div style={{fontSize:12}}><b>{en.actor}</b>{en.invoiceId?` · ${en.invoiceId}`:''}{en.detail?` · ${en.detail}`:''}</div>
              <div className="audit-hash">{en.hash.slice(0,32)}…</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ══ SHELL ══ */
export default function App(){
  const [user,setUser]=useState(auth.user())
  const [tab,setTab]=useState('dashboard')
  if(!user) return <Login onLogin={setUser}/>
  const isAdmin = user.role==='admin'
  const NAV=[['dashboard','📊','Dashboard'],['sandbox','🧾','Invoice Sandbox'],['monitor','📡','Live Monitor'],['queue','🏛️','Compliance Bureau'],['model','🧠','Model & Tuning'],['eval','📏','Evaluation'],['traces','🔬','Observability'],['audit','🔒','Audit Trail']]
  const TITLES={
    dashboard:['Accounts-Payable Risk Overview','Real-time fraud posture across incoming B2B invoice traffic'],
    sandbox:['Invoice Audit Sandbox','Craft any invoice — Tier-1 scores it instantly, Tier-2 reads the contract'],
    monitor:['Live Invoice Monitor','Streaming AP events scored by the hybrid two-tier engine'],
    queue:['Compliance Oversight Bureau','Auditor verdicts that continuously recalibrate the model'],
    model:['Model & Tuning','Two-tier pipeline, MCP tool surface, adaptive weights, live thresholds'],
    eval:['Model Evaluation','Precision, recall, AUPRC and confusion matrix computed on a labelled test set'],
    traces:['LLM Observability','Per-span traces, token cost per audit, and the Tier-1 vs Tier-2 latency funnel'],
    audit:['Audit Trail','Immutable, hash-chained log of every action in the system'],
  }
  const logout=()=>{ auth.logout(); setUser(null) }
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-logo">
          <div className="side-icon">🛡️</div>
          <div><div className="side-name">Audexa</div><div className="side-sub">ERP Fraud Engine</div></div>
        </div>
        <nav className="side-nav">
          <div className="snav-label">Operations</div>
          {NAV.slice(0,3).map(([id,ico,l])=><button key={id} className={`snav ${tab===id?'on':''}`} onClick={()=>setTab(id)}><span className="ico">{ico}</span>{l}</button>)}
          <div className="snav-label">Intelligence</div>
          {NAV.slice(3,7).map(([id,ico,l])=><button key={id} className={`snav ${tab===id?'on':''}`} onClick={()=>setTab(id)}><span className="ico">{ico}</span>{l}</button>)}
          <div className="snav-label">Governance</div>
          {NAV.slice(7).map(([id,ico,l])=><button key={id} className={`snav ${tab===id?'on':''}`} onClick={()=>setTab(id)}><span className="ico">{ico}</span>{l}</button>)}
        </nav>
        <div className="side-foot">
          <div className="engine-pill"><span className="eng-dot"/><div><div className="eng-txt">Hybrid Engine Online</div><div className="eng-sub">Postgres · Isolation Forest · MCP</div></div></div>
        </div>
      </aside>
      <main className="main">
        <div className="page-head" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16}}>
          <div><div className="page-title">{TITLES[tab][0]}</div><div className="page-sub">{TITLES[tab][1]}</div></div>
          <div className="userbox">
            <div className="userchip">👤 <b>{user.username}</b> · {user.role}</div>
            <button className="logout-btn" onClick={logout}>Sign out</button>
          </div>
        </div>
        <select className="mobile-nav" value={tab} onChange={e=>setTab(e.target.value)}>{NAV.map(([id,ico,l])=><option key={id} value={id}>{ico} {l}</option>)}</select>{tab==='dashboard'&&<Dashboard go={setTab}/>}
        {tab==='sandbox'&&<Sandbox/>}
        {tab==='monitor'&&<Monitor/>}
        {tab==='queue'&&<ReviewQueue/>}
        {tab==='model'&&<ModelPage/>}
        {tab==='eval'&&<Evaluation/>}
        {tab==='traces'&&<Observability/>}
        {tab==='audit'&&<AuditLog/>}
      </main>
    </div>
  )
}
