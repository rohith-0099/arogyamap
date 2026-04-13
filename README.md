# ArogyaMap — Community Disease Intelligence

Community-powered disease surveillance and outbreak detection for rural India.
Patients report symptoms anonymously via web (voice + photo), Telegram bot, or email.
Every report becomes a glowing dot on a live dark map. When 5+ similar reports cluster
within 2km in 6 hours, an outbreak alert fires automatically.

## Quick Start

### 1. Create Supabase table
Copy `supabase_schema.sql` → Supabase Dashboard → SQL Editor → Run.

### 2. Fill environment variables
```bash
cp .env.local.example .env.local
# Fill in all values
```

### 3. Install and seed
```bash
# Frontend
cd client && npm install

# Backend
cd ../server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python3 seed.py   # 25 demo reports
```

### 4. Run locally

**Terminal 1: Next.js frontend**
```bash
cd client && npm run dev
```

**Terminal 2: Python backend**
```bash
cd server && .venv/bin/python3 main.py
```

Open http://localhost:3000

## Architecture

```
Patient → Web/Telegram/Email
              ↓
    Python FastAPI (port 8000)
    ├── Groq Whisper STT
    ├── Llama 3.3 Triage
    ├── Librosa Acoustic Analysis
    ├── HuggingFace LLaVA Photo
    └── gTTS Voice Reply
              ↓
    Supabase PostgreSQL
              ↓ (real-time)
    Next.js 14 Frontend
    ├── Live Disease Map (Leaflet + CartoDB)
    ├── Report Form (mic + photo)
    ├── ASHA Dashboard (urgency table + route)
    └── Analytics (epidemic curves)
```

## Report Channels

| Channel | Input | Response |
|---------|-------|----------|
| Web | Voice recording + photo | Urgency badge + voice reply |
| Telegram | Voice message or text | Emoji reply + clinic location pin |
| Email | Text or audio attachment | Reply email with voice advice |

## Outbreak Rule
5+ same-symptom reports within 2km radius within 6 hours → red outbreak alert on map + banner.

## Environment Variables

```
GROQ_API_KEY          — Groq (free tier: console.groq.com)
HF_API_KEY            — HuggingFace (free: huggingface.co)
TELEGRAM_TOKEN        — @BotFather on Telegram
GMAIL_USER            — Gmail address for bot
GMAIL_PASS            — Gmail app password
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
PYTHON_API_URL        — http://localhost:8000 (or Render URL)
```

## Deployment

**Frontend:** Push to GitHub → Vercel auto-deploys (free tier).

**Backend:** Connect GitHub to Render.com → select `server/main.py` → free tier.
Start command: `.venv/bin/uvicorn main:app --host 0.0.0.0 --port $PORT`

## Privacy & PHI Compliance

- No names, phone numbers, or national IDs stored
- GPS rounded to 500m grid
- User identity = one-way MD5 hash
- `symptoms_raw` is private; only `symptoms_summary` (AI-generalised) is public
- All PHI columns tagged in schema comments
- RLS enabled on all tables

## Hackathon
Domain: Health Tech — Early diagnosis, patient monitoring,
healthcare accessibility for underserved communities.