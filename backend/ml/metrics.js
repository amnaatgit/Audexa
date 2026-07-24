/**
 * Precision/recall/F1 at an operating threshold, plus AUPRC (area under the
 * precision-recall curve, trapezoidal integration over sampled thresholds).
 */
function confusionAt(pairs, threshold) {
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const p of pairs) {
    const predicted = p.score >= threshold ? 1 : 0
    if (predicted === 1 && p.label === 1) tp++
    else if (predicted === 1 && p.label === 0) fp++
    else if (predicted === 0 && p.label === 1) fn++
    else tn++
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0
  return { threshold, tp, fp, fn, tn, precision, recall, f1 }
}

function computeAUPRC(pairs) {
  const points = []
  for (let t = 0; t <= 100; t += 2) points.push(confusionAt(pairs, t))
  points.sort((a, b) => a.recall - b.recall)
  let auprc = 0
  for (let i = 1; i < points.length; i++) {
    const dRecall = points[i].recall - points[i - 1].recall
    const avgPrecision = (points[i].precision + points[i - 1].precision) / 2
    auprc += dRecall * avgPrecision
  }
  return Math.abs(auprc)
}

function evaluate(pairs, threshold) {
  return { ...confusionAt(pairs, threshold), auprc: computeAUPRC(pairs) }
}

module.exports = { evaluate }
