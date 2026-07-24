/**
 * Vendor Master + Service Contracts (unstructured text).
 * Tier 2 Deep Audit reads these contracts to verify invoice line items.
 */
const VENDORS = {
  'VND-101': { name:'SwiftHaul Logistics',    category:'logistics',              onboardedDays:900, avgInvoice:2800,  homeCountry:'DE' },
  'VND-102': { name:'Apex Raw Materials',     category:'raw_materials',          onboardedDays:1500,avgInvoice:18000, homeCountry:'US' },
  'VND-103': { name:'NovaTech IT Services',   category:'it_services',            onboardedDays:400, avgInvoice:5200,  homeCountry:'GB' },
  'VND-104': { name:'PrimeFix Maintenance',   category:'equipment_maintenance',  onboardedDays:700, avgInvoice:1400,  homeCountry:'AE' },
  'VND-105': { name:'GlobalPack Supplies',    category:'packaging',              onboardedDays:200, avgInvoice:6500,  homeCountry:'CN' },
  'VND-106': { name:'Meridian Consulting',    category:'professional_services',  onboardedDays:20,  avgInvoice:9000,  homeCountry:'PK' },
}

const CONTRACTS = {
  'VND-101': `MASTER SERVICE AGREEMENT — SwiftHaul Logistics GmbH
Clause 3.1: All domestic and international shipments are billed at a FLAT RATE of $450 per shipment.
Clause 3.2: No fuel surcharges, peak-season surcharges, or handling premiums may be added to any invoice. The flat rate is fully inclusive.
Clause 4.2: Expedited handling is NOT covered under this agreement and requires a separate signed purchase order before billing.
Clause 7.1: Maximum single-invoice value: $20,000. Invoices above this cap require CFO pre-approval reference number.`,
  'VND-102': `SUPPLY AGREEMENT — Apex Raw Materials Inc.
Clause 2.1: Steel billet supplied at a fixed contracted rate of $800 per metric ton.
Clause 2.4: No expedite fees, no storage fees. Logistics is arranged and paid by the buyer separately.
Clause 5.3: Maximum single-invoice value: $50,000.
Clause 6.1: All shipments must originate from certified mills in the United States or Canada. Third-country transshipment is a material breach.`,
  'VND-103': `IT SERVICES RETAINER — NovaTech IT Services Ltd.
Clause 1.2: Monthly support retainer fixed at $3,500.
Clause 1.4: Additional consulting billed at $90/hour, capped at 40 hours per month without written amendment.
Clause 2.1: Hardware, licenses, or equipment purchases are OUT OF SCOPE and may not appear on service invoices.
Clause 3.3: No administrative, processing, or miscellaneous fees of any kind.`,
  'VND-104': `MAINTENANCE AGREEMENT — PrimeFix Equipment Maintenance LLC
Clause 2.2: Standard call-out fee: $250 per visit. Parts billed at cost plus 10% documented markup.
Clause 2.5: Overtime labor requires a pre-approved purchase order; undocumented overtime is non-billable.
Clause 4.1: Maximum single-invoice value: $10,000.`,
  'VND-105': `PACKAGING SUPPLY AGREEMENT — GlobalPack Supplies Co.
Clause 1.1: Corrugated units at $1.10/unit, protective foam at $4.60/unit.
Clause 3.2: Maximum single-invoice value: $15,000.
Clause 3.4: No fuel surcharges or currency-adjustment fees permitted.`,
  'VND-106': `CONSULTING ENGAGEMENT LETTER — Meridian Consulting (Provisional Vendor)
Clause 1.1: Advisory services billed at $120/hour. Detailed timesheets are mandatory attachments.
Clause 2.2: Maximum single-invoice value during 90-day probation: $8,000.
Clause 2.3: No retainers, no lump-sum "project fees" during probation period.`,
}

// Line-item catalogue used by the simulator & sandbox
const LINE_ITEMS = {
  fuel_surcharge:  { label:'Fuel surcharge',              amount:380  },
  expedite_fee:    { label:'Expedited handling fee',      amount:900  },
  overtime_labor:  { label:'Undocumented overtime labor', amount:1200 },
  hardware:        { label:'Hardware purchase',           amount:2400 },
  misc_admin_fee:  { label:'Miscellaneous admin fee',     amount:650  },
  lump_sum_fee:    { label:'Lump-sum project fee',        amount:5000 },
}

// 12-month historical billing profile — which add-ons each vendor has legitimately billed before
const HISTORICAL_ITEMS = {
  'VND-101': [],                          // SwiftHaul: flat rate only, never add-ons
  'VND-102': [],                          // Apex: material only
  'VND-103': ['overtime_labor'],          // NovaTech: occasionally bills approved overtime
  'VND-104': ['overtime_labor'],          // PrimeFix: PO-backed overtime seen before
  'VND-105': [],                          // GlobalPack: units only
  'VND-106': [],                          // Meridian: probationary, no history
}

module.exports = { VENDORS, CONTRACTS, LINE_ITEMS, HISTORICAL_ITEMS }
