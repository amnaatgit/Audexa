/**
 * Tier 1 — Low-latency statistical filter for B2B invoices.
 * Fast, cheap checks that run on EVERY invoice. Anything scoring past the
 * review threshold is escalated to the Tier-2 Deep Audit (MCP contract agent).
 */
const { VENDORS } = require('./contracts')

// Sanctioned / elevated-risk shipping jurisdictions
const GEO_RISK = { RU:1, KP:1, IR:1, BY:0.85, VE:0.6, NG:0.55, CN:0.35, VN:0.3, UA:0.4,
                   PK:0.1, US:0.05, GB:0.05, DE:0.05, CA:0.05, AE:0.1, IN:0.15, BR:0.2, MX:0.2, ID:0.25, AU:0.05 }
const LOW_RISK = new Set(['US','GB','DE','CA','AU','AE','PK'])

const CATEGORY_RISK = {
  logistics:0.15, raw_materials:0.1, it_services:0.2, equipment_maintenance:0.15,
  packaging:0.15, professional_services:0.55,
}

const RULES = [
  {
    id:'price_spike', name:'Price Spike vs Vendor Baseline', weight:16,
    explain:(t,c)=>`Invoice is ${c.zscore.toFixed(1)}σ above ${t.vendorName}'s historical average of $${c.vendorAvg.toLocaleString()}`,
    check:(t,c)=>{
      const avg = c.vendorAvg
      const sd = Math.max(avg*0.25, 300)
      const z = (t.amount-avg)/sd; c.zscore = Math.max(0,z)
      if (z>=4) return 1; if (z>=3) return .7; if (z>=2) return .4; return 0
    },
  },
  {
    id:'duplicate_invoice', name:'Duplicate Invoice Detected', weight:20,
    explain:t=>`Invoice ID ${t.invoiceRef} was already submitted by this vendor — classic double-billing pattern`,
    check:(t,c)=>c.isDuplicate?1:0,
  },
  {
    id:'submission_velocity', name:'Submission Velocity', weight:14,
    explain:(t,c)=>`${c.recentCount} invoices from ${t.vendorName} in the last 10 minutes`,
    check:(t,c)=>{ const n=c.recentCount; if(n>=6)return 1; if(n>=4)return .7; if(n>=2)return .35; return 0 },
  },
  {
    id:'geo_mismatch', name:'Bill-To vs Ship-From Mismatch', weight:18,
    explain:t=>`Vendor bills from ${t.billFrom} but goods ship from ${t.shipFrom} — possible sanctions-evasion transshipment`,
    check:t=>(LOW_RISK.has(t.billFrom) && (GEO_RISK[t.shipFrom]??0.3)>=0.55) ? 1 : 0,
  },
  {
    id:'sanctioned_origin', name:'High-Risk Shipping Origin', weight:15,
    explain:t=>`Shipment originates from ${t.shipFrom}, an elevated-risk / sanctioned jurisdiction`,
    check:t=>GEO_RISK[t.shipFrom] ?? 0.3,
  },
  {
    id:'round_amount', name:'Suspiciously Round Amount', weight:8,
    explain:t=>`$${t.amount.toLocaleString()} is an exactly round figure — legitimate invoices rarely are`,
    check:t=>(t.amount>=3000 && t.amount%1000===0)?0.8:(t.amount>=1000&&t.amount%500===0)?0.4:0,
  },
  {
    id:'new_vendor', name:'Probationary Vendor', weight:10,
    explain:t=>`Vendor onboarded only ${t.onboardedDays} day(s) ago — inside the 90-day fraud-risk window`,
    check:t=>{ if(t.onboardedDays<=30)return 1; if(t.onboardedDays<=90)return .5; return 0 },
  },
  {
    id:'odd_hours', name:'Off-Hours Submission', weight:7,
    explain:t=>`Submitted at ${String(t.hour).padStart(2,'0')}:00 — outside business hours, common in compromised-account fraud`,
    check:t=>(t.hour>=1&&t.hour<=5)?0.8:(t.hour===0||t.hour===6)?0.4:0,
  },
  {
    id:'category_risk', name:'High-Risk Vendor Category', weight:10,
    explain:t=>`"${t.category.replace('_',' ')}" invoices carry elevated fraud rates (hard-to-verify deliverables)`,
    check:t=>CATEGORY_RISK[t.category] ?? 0.25,
  },
  {
    id:'suspicious_line_items', name:'Off-Contract Line Items Present', weight:12,
    explain:(t)=>`${t.lineItems.length} add-on line item(s) present — escalating to Tier-2 contract audit`,
    check:t=>t.lineItems.length>=3?1:t.lineItems.length===2?.6:t.lineItems.length===1?.3:0,
  },
]

module.exports = { RULES, GEO_RISK, VENDORS }
