# CareLink AI Insights (Python 3.14.3)

Serverless-style FastAPI service that analyzes CareLink referral data.

## What it answers
- **Where are the most cases?** barangay / city / referring & receiving centers
- **Which places have too many requests?** overload scoring vs average volume
- **What are the most cases?** referral type, urgency, severity, reason themes

## Run locally

```powershell
cd ai
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL="postgresql://..."
uvicorn main:app --reload --port 8001
```

Health: `http://localhost:8001/health`  
Insights: `http://localhost:8001/insights?days=90`

## Deploy
- **Vercel serverless:** deploy the `ai/` folder (`vercel.json` included)
- **Render:** add a Python web service with root `ai`, start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set `DATABASE_URL` (same Supabase Postgres URL as the Node API) and optional `CLIENT_ORIGIN`.
