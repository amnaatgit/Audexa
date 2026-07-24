/**
 * Synthetic labelled invoice generator — used both to train the Isolation
 * Forest and to build held-out sets for runEvaluation(). Fraud injection
 * mirrors the same signals the Tier-1 rules look for (price spikes, off-hours,
 * high-risk shipping origins, new vendors, off-contract line items) so the
 * trained model and the rules engine are evaluated against a consistent notion
 * of "fraud".
 */
const { VENDORS } = require('../engine/contracts')

const VIDS = Object.keys(VENDORS)
const RISKY_ORIGINS = ['RU', 'NG', 'IR', 'KP', 'BY']
const LINE_ITEM_POOL = ['fuel_surcharge', 'expedite_fee', 'overtime_labor', 'hardware', 'misc_admin_fee', 'lump_sum_fee']

const pick = arr => arr[Math.floor(Math.random() * arr.length)]
const shuffle = arr => [...arr].sort(() => Math.random() - 0.5)

function generate(n = 400, fraudRate = 0.12) {
  const out = []
  for (let i = 0; i < n; i++) {
    const isFraud = Math.random() < fraudRate
    const vendorId = pick(VIDS)
    const v = VENDORS[vendorId]

    const lineItems = isFraud && Math.random() < 0.7
      ? shuffle(LINE_ITEM_POOL).slice(0, 1 + Math.floor(Math.random() * 3))
      : (Math.random() < 0.1 ? shuffle(LINE_ITEM_POOL).slice(0, 1) : [])

    const amount = isFraud
      ? Math.round(v.avgInvoice * (2.5 + Math.random() * 3))
      : Math.round(v.avgInvoice * (0.7 + Math.random() * 0.6))

    const shipFrom = isFraud && Math.random() < 0.5 ? pick(RISKY_ORIGINS) : v.homeCountry
    const hour = isFraud && Math.random() < 0.4 ? 3 : 8 + Math.floor(Math.random() * 10)
    const onboardedDays = isFraud && Math.random() < 0.3 ? Math.floor(Math.random() * 30) : v.onboardedDays

    out.push({
      vendorId, vendorName: v.name, category: v.category, onboardedDays,
      invoiceRef: `SIM-${i}-${Math.floor(Math.random() * 99999)}`,
      amount, billFrom: v.homeCountry, shipFrom, hour, lineItems,
      label: isFraud ? 1 : 0,
    })
  }
  return out
}

module.exports = { generate }
