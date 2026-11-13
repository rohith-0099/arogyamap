# ArogyaMap

**Community disease surveillance by voice: people report symptoms in their own language, and health workers see outbreaks forming on a live map.**

[![License: MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-black)
![FastAPI](https://img.shields.io/badge/FastAPI-black)

**1st Prize, INCEPTA '26** (Institution's Innovation Council, NSS College of Engineering)

<!-- Add a screenshot of the health-worker dashboard map here:
![ArogyaMap dashboard with outbreak clusters](docs/dashboard.png) -->

In rural India, an outbreak is often noticed only after clinics fill up. Many people won't fill in a form, but they will send a voice note. ArogyaMap lets anyone report symptoms by voice, photo or text through the web app, Telegram or email, in 10 Indian languages. It replies with triage advice and the nearest clinic, and it plots every report on a map so ASHA health workers can spot clusters early.

## Quick start

You need Python 3.11+, Node.js 20+, a free [Supabase](https://supabase.com) project and a free [Groq](https://console.groq.com) API key.

```bash
git clone https://github.com/rohith-0099/arogyamap.git && cd arogyamap
# 1. In the Supabase SQL editor, run supabase_schema.sql
# 2. Backend
cd server && pip install -r requirements.txt
GROQ_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_KEY=... uvicorn main:app --port 8000
# 3. Frontend (new terminal)
cd client && npm install && npm run dev        # open http://localhost:3000
```

The frontend reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` and `NEXT_PUBLIC_PYTHON_API_URL=http://localhost:8000` from `client/.env.local`.

## What it does

- **Report by voice, photo or text.** Groq Whisper turns the voice note into text and an LLM triages it. A vision model reads photos of visible symptoms.
- **Works on the channels people already use.** Reports arrive through the web app (installable as a PWA), a Telegram bot or email, and are normalised into one format.
- **Replies in the reporter's language,** with urgency, advice, whether to see a doctor, and a spoken reply (gTTS).
- **Finds the nearest clinic or pharmacy** from OpenStreetMap.
- **Detects outbreak clusters.** It flags 5 or more reports of the same symptom within 2 km and 6 hours, and forecasts the next 48 hours of report volume with Prophet.
- **Gives health workers a dashboard,** behind a role-based login, with the map, patient list, analytics and an auto-generated weekly district bulletin.

## How it works

```
Web / PWA ─┐
Telegram ──┼─▶ channel_router ─▶ triage (Whisper + LLM) ─▶ Supabase (Postgres)
Email ─────┘        │                 photo (vision LLM)          │
                    └─▶ acoustic (cough / voice stress)            ▼
                                            outbreak_detector (BallTree clusters + Prophet)
                                                                  │
                                            Next.js dashboard: map, analytics, bulletin
```

- `server/`: FastAPI. Triage, photo analysis, cough detection, outbreak clustering, clinic finder, bulletins, and the Telegram and email channels.
- `client/`: Next.js app. The report form and the health-worker dashboard, with Supabase auth.
- Heavy libraries (librosa, scikit-learn, Prophet) are loaded lazily, so the backend boots on free-tier hosting.

## Limitations

- **Triage is advice, not diagnosis.** It comes from an LLM and is not a medical device. People are always pointed to a clinic for anything serious.
- **Cough detection is a heuristic** based on audio energy and MFCC features, not a trained classifier.
- **Cluster rules are fixed** (5 reports, 2 km, 6 hours). They are not tuned per district, and they have not been validated against real outbreak data.
- **Location depends on what the reporter shares,** or on a city lookup when GPS isn't available.
- It needs Groq for speech and triage, and Supabase for storage and login.

## Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `GROQ_API_KEY` | server, client | Speech-to-text, triage, photo analysis, bulletins |
| `GEMINI_API_KEY` | server | Fallback model for triage |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | server, client | Database |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Browser auth |
| `NEXT_PUBLIC_PYTHON_API_URL` | client | Backend URL |
| `TELEGRAM_TOKEN`, `ENABLE_TELEGRAM` | server | Telegram channel (optional) |
| `GMAIL_USER`, `GMAIL_PASS`, `ENABLE_EMAIL` | server | Email channel (optional) |
| `ENABLE_OUTBREAK` | server | Scheduled outbreak detection |
| `BULLETIN_CHANNEL`, `FRONTEND_URL`, `GROQ_VISION_MODEL` | server | Optional settings |

A `Dockerfile` is included that runs the backend on port 7860, for Hugging Face Spaces.

## Acknowledgements

Map and clinic data © OpenStreetMap contributors. ArogyaMap won 1st Prize at INCEPTA '26, organised by the Institution's Innovation Council at NSS College of Engineering.

## License

[MIT](LICENSE)
