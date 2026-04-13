# ArogyaMap — Claude Code Project Context

## What This Is
Community-powered disease intelligence platform for rural healthcare in India.
Patients report symptoms via web (voice + photo), Telegram bot, or email.
Reports appear as glowing dots on a live dark map. Clusters trigger outbreak alerts.
ASHA workers get a dashboard with urgency rankings and optimised visit routes.

## Stack
- **Frontend**: Next.js 14 App Router, Tailwind CSS, Leaflet.js
- **Database**: Supabase (PostgreSQL + real-time)
- **AI STT**: Groq Whisper (whisper-large-v3)
- **AI Triage**: Groq Llama 3.3 70B
- **Photo AI**: HuggingFace LLaVA 1.5 7B
- **Audio ML**: Librosa + scikit-learn (local)
- **TTS**: gTTS (22 languages, no key)
- **Telegram**: python-telegram-bot
- **Email**: imaplib + smtplib + Gmail
- **Outbreak**: Prophet (Meta, local)
- **Map tiles**: CartoDB Dark Matter (free, no key)
- **Clinics**: OpenStreetMap Overpass API

## Key Directories
- `client/` — Next.js frontend project
- `server/` — FastAPI backend project
- `client/app/` — Next.js pages and API routes
- `client/components/` — React UI components
- `server/main.py` — Backend entry point

## Supabase Table: reports
id, user_hash, lat, lng, city, symptoms_raw, symptoms_summary, urgency,
advice, has_cough, voice_stress, cough_type, photo_analysis, channel,
language, follow_up_sent, follow_up_status, outbreak_flag, timestamp

## Urgency Colors
- high → #ff2200
- medium → #ff8800
- low → #00cc66

## Map Center
Kerala, India: [10.8505, 76.2711]

## Python API
Runs on port 8000. Next.js API routes proxy to it for audio/photo processing.

## Outbreak Rule
5+ same-symptom reports within 2km radius within 6 hours → outbreak alert.
