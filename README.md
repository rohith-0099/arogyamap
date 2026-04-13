# ArogyaMap

Community-powered disease intelligence platform. 
Patients report symptoms through voice, Telegram, or email.
Every report becomes an anonymous dot on a live public 
disease map. Outbreaks detected automatically.

## Stack
- Next.js 14 + Tailwind + Leaflet.js (dark map)
- FastAPI + Python (triage, acoustic analysis)
- Supabase (PostgreSQL + real-time)
- Groq API (Whisper STT + Llama 3)
- Librosa (cough fingerprinting)

## Channels
- Web App (voice + photo)
- Telegram Bot
- Email (Gmail)

## Setup
1. Clone repo
2. Copy .env.local.example to .env.local and fill keys
3. npm install
4. cd python && pip install -r requirements.txt
5. npm run dev (frontend on :3000)
6. uvicorn main:app --reload (backend on :8000)

## Hackathon
Domain: Health Tech — Early diagnosis, patient monitoring,
healthcare accessibility for underserved communities.