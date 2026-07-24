# 🛡️ Audexa — Hybrid Enterprise ERP Fraud Engine (v4)

Production-grade B2B invoice fraud detection: a two-tier engine combining a
trained ML anomaly model + statistical rules (Tier 1) with an LLM contract-audit
agent over the Model Context Protocol (Tier 2). Fully persistent, authenticated,
continuously evaluated, and audited.

## What makes it real (not a demo)
1. **Persistence** — SQLite stores every invoice, learned weight, trace, verdict,
   and audit entry. Everything survives restarts.
2. **Trained ML model** — an Isolation Forest (100 trees, built from scratch)
   trains on invoice history and contributes a real anomaly signal to Tier 1.
3. **Computed evaluation** — precision, recall, F1, AUPRC and a confusion matrix
   are MEASURED on a labelled test set, not hardcoded. Re-runnable from the UI.
4. **Validated feedback loop** — each auditor verdict re-evaluates the model and
   records precision before → after, proving the online learning actually helps.
5. **Auth + immutable audit trail** — JWT login (bcrypt), role-based protected
   routes, and a SHA-256 hash-chained audit log with integrity verification.

## Architecture
Invoice → Tier-1 (Isolation Forest anomaly + statistical rules: z-score price
spikes, duplicates, velocity, bill-to/ship-from geo mismatch — microseconds,
100% of traffic) → if flagged → Tier-2 MCP orchestration:
  1. fetch_pdf_contract_terms(vendorId)
  2. fetch_historical_line_items(vendorId)
  3. LLM Auditor Agent — audits line items, cites exact clauses
→ Decision Router (clear / compliance hold / quarantine)
→ Compliance Oversight Bureau (verdicts retrain weights, revalidated each time)
→ everything logged to the immutable audit trail.

## Run locally
Terminal 1:
    cd backend
    npm install
    npm run seed     # optional: populate 80 invoices + first evaluation
    npm start        # → :3000
Terminal 2:
    cd frontend
    npm install
    npm run dev      # → :5173

Login with  auditor / auditor123  or  admin / admin123.

## Deploy
Backend → Railway: Root = backend. Add a persistent Volume mounted at
/app/backend/db (or set DB_PATH) so the SQLite file survives redeploys.
Env vars: JWT_SECRET (any random string), and optionally ANTHROPIC_API_KEY
to run Tier-2 audits through Claude instead of the clause-matcher agent.
Frontend → Vercel: Root = frontend, Framework = Vite, Output = dist,
env VITE_API_URL = your Railway URL (no trailing slash).

## The 8 tabs
Dashboard · Invoice Sandbox · Live Monitor · Compliance Bureau ·
Model & Tuning · Evaluation (confusion matrix + metrics) ·
Observability (latency funnel + cost tracing) · Audit Trail (hash-chained)

## API (auth-protected routes need a Bearer token)
POST /api/login · POST /api/score · POST /api/simulate · GET /api/transactions
GET /api/stats · GET /api/model · GET /api/telemetry · GET /api/evaluation
POST /api/review/:id 🔒 · POST /api/thresholds 🔒 · POST /api/evaluate 🔒
POST /api/retrain 🔒 · GET /api/audit-log 🔒 · POST /mcp
