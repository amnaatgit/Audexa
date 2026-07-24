/**
 * Isolation Forest (Liu, Ting & Zhou, 2008): anomalies are "few and different",
 * so they take fewer random splits to isolate than normal points. Score is the
 * normalized average path length across an ensemble of random trees — shorter
 * average path ⇒ closer to 1 (more anomalous).
 */
const { GEO_RISK } = require('../engine/rules')

function averagePathAdjustment(n) {
  if (n <= 1) return 0
  const EULER_GAMMA = 0.5772156649
  return 2 * (Math.log(n - 1) + EULER_GAMMA) - (2 * (n - 1) / n)
}

function buildTree(rows, depth, maxDepth, featureCount) {
  if (depth >= maxDepth || rows.length <= 1) return { isLeaf: true, size: rows.length }
  const featureIdx = Math.floor(Math.random() * featureCount)
  const values = rows.map(r => r[featureIdx])
  const min = Math.min(...values), max = Math.max(...values)
  if (min === max) return { isLeaf: true, size: rows.length }
  const splitValue = min + Math.random() * (max - min)
  const left = [], right = []
  rows.forEach(r => (r[featureIdx] < splitValue ? left : right).push(r))
  if (!left.length || !right.length) return { isLeaf: true, size: rows.length }
  return {
    isLeaf: false, featureIdx, splitValue,
    left: buildTree(left, depth + 1, maxDepth, featureCount),
    right: buildTree(right, depth + 1, maxDepth, featureCount),
  }
}

function pathLength(row, node, depth) {
  if (node.isLeaf) return depth + averagePathAdjustment(node.size)
  return pathLength(row, row[node.featureIdx] < node.splitValue ? node.left : node.right, depth + 1)
}

class IsolationForest {
  constructor({ nTrees = 100, sampleSize = 256 } = {}) {
    this.nTrees = nTrees
    this.sampleSize = sampleSize
    this.trees = []
    this.trainedOn = 0
    this.featureCount = 0
  }
  fit(X) {
    if (!X.length) throw new Error('IsolationForest.fit requires at least one sample')
    this.featureCount = X[0].length
    this.trainedOn = X.length
    const size = Math.min(this.sampleSize, X.length)
    const maxDepth = Math.ceil(Math.log2(Math.max(size, 2)))
    this.trees = Array.from({ length: this.nTrees }, () => {
      const sample = Array.from({ length: size }, () => X[Math.floor(Math.random() * X.length)])
      return buildTree(sample, 0, maxDepth, this.featureCount)
    })
  }
  score(row) {
    if (!this.trees.length) return 0
    const avgPath = this.trees.reduce((sum, tree) => sum + pathLength(row, tree, 0), 0) / this.trees.length
    const c = averagePathAdjustment(this.sampleSize)
    if (!c) return 0
    return Math.pow(2, -avgPath / c)
  }
}

// Numeric feature vector for an invoice, given the vendor's historical average.
function featureVector(inv, vendorAvg) {
  const sd = Math.max(vendorAvg * 0.25, 300)
  const amountZ = (inv.amount - vendorAvg) / sd
  const shipRisk = GEO_RISK[inv.shipFrom] ?? 0.3
  const billRisk = GEO_RISK[inv.billFrom] ?? 0.3
  return [
    amountZ,
    inv.hour,
    (inv.lineItems || []).length,
    Math.min(inv.onboardedDays || 0, 2000) / 2000,
    shipRisk,
    Math.abs(shipRisk - billRisk),
  ]
}

module.exports = { IsolationForest, featureVector }
