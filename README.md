# ArogyaMap

**Community-powered disease intelligence for rural India.**

ArogyaMap lets anyone — even someone who can't read or type — report symptoms
from a phone, and it turns those reports into a live outbreak map that ASHA
workers and health supervisors can act on. Patients talk, take photos, or send
a Telegram / email message. Groq Llama 3.3 triages the symptoms, Whisper
transcribes the voice, LLaVA reads skin/wound photos, librosa listens for
cough, and Prophet detects clusters. Every report appears as a glowing dot on
a dark map in real time. Five matching reports within 2 km in 6 hours trip an
outbreak alert.

🌐 **Live site:** <https://arogyamap.vercel.app/>

---

## Table of contents

1. [What you can do](#what-you-can-do)
2. [Try it now (demo credentials)](#try-it-now-demo-credentials)
3. [How to report symptoms](#how-to-report-symptoms)
   - [Web (voice + photo)](#1-web--voice--photo)
   - [Telegram bot](#2-telegram-bot)
   - [Email](#3-email)
4. [How to use the dashboard](#how-to-use-the-dashboard)
5. [Tech stack](#tech-stack)
6. [Running locally](#running-locally)
7. [Self-hosting for free](#self-hosting-for-free)
8. [Project layout](#project-layout)
9. [Privacy](#privacy)

---

## What you can do

- **Patients / residents** — report symptoms in your own language, by voice,
  text, photo, Telegram or email. Get instant advice and a nearest-clinic
  suggestion. No app install, no signup.
- **ASHA workers** — see ranked patient visits for your zone, auto-optimised
  route, 48-hour outbreak pulse, and a one-click "mark as fake" button to
  clean up bad reports from the map.
- **Supervisors / admins** — filter across country → state → district → city,
  monitor outbreaks, and remove junk data.
- **Anyone** — open the map on the home page and watch live disease signals
  across India.

---

## Try it now (demo credentials)

Open the live site: <https://arogyamap.vercel.app/>

### ASHA worker login
| Field    | Value                       |
|----------|-----------------------------|
| Email    | `asha.worker@arogyamap.in`  |
| Password | `asha123`                   |

1. Go to <https://arogyamap.vercel.app/login>
2. Enter the credentials above
3. You'll land on the **ASHA Worker Dashboard** with ranked patient visits,
   a location column, and per-row delete buttons.

> **Note:** This is a public demo account. Do not store real patient data
> against it. For production, create your own accounts via Supabase Auth.

---

## How to report symptoms

There are three channels. All three feed into the same live map and the same
ASHA worker dashboard.

### 1. Web — voice + photo

1. Go to <https://arogyamap.vercel.app/report>
2. Allow **microphone** and **location** access when the browser asks.
3. Tap the glowing mic globe and **speak your symptoms** in any Indian
   language (Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada,
   Malayalam, Punjabi, English…). Example: *"mujhe do din se bukhar aur
   khansi hai"*.
4. Optionally take a **photo** of a rash, wound, or affected area — the app
   uses HuggingFace LLaVA 1.5 to describe it.
5. Tap **Submit**. You'll see:
   - Triage urgency (high / medium / low)
   - Advice in your language
   - A spoken reply via gTTS
   - The nearest clinic from OpenStreetMap
6. Your report instantly appears as a dot on the home-page map.

**Tips**
- If GPS is denied, pick your city from the fallback list — it still works.
- Voice is more reliable than typing; Groq Whisper handles accented speech
  well.
- Reports are anonymous — only a privacy hash is stored, no name or phone.

### 2. Telegram bot

1. Open Telegram on your phone.
2. Search for the ArogyaMap bot (handle depends on the `TELEGRAM_TOKEN`
   configured on the server — ask the admin or check the deployed bot link).
3. Tap **Start** or send `/start`.
4. **Share your location** when the bot asks (one tap — Telegram does this
   natively).
5. **Send a voice message** describing your symptoms in any language, OR type
   them, OR send a photo of a rash / wound / affected area.
6. The bot replies with:
   - Triage urgency
   - Multilingual advice
   - A voice reply you can listen to
   - A link to your nearest clinic

Your report lands on the same live map and dashboard.

**Tips**
- You can send voice + photo + text in one conversation; the bot combines
  them into a single report.
- Works on any phone that runs Telegram — no data plan needed beyond
  Telegram itself.
- Same privacy model as the web channel.

### 3. Email

For rural clinics, older users, or anyone without smartphone access.

1. Send an email to the ArogyaMap inbox (the Gmail address configured in
   `GMAIL_USER` on the server).
2. **Subject:** your city name — e.g. `Kollam` or `Thiruvananthapuram`. This
   helps the system geocode you if you can't share GPS.
3. **Body:** describe the symptoms in plain English or any Indian language.
4. **Attachments:** optionally attach a photo (skin/wound) or a voice note
   (`.ogg`, `.mp3`, `.wav`).
5. Within 60 seconds, the server polls Gmail via IMAP, triages the message,
   and replies with urgency, advice, and a clinic link.

Your report appears on the live map like any other channel.

---

## How to use the dashboard

After logging in at <https://arogyamap.vercel.app/login> with the ASHA
credentials above, you'll see:

### Top section — ASHA Worker Dashboard
- **Summary cards:** total reports in last 48 h, high/medium urgency counts,
  active outbreak clusters.
- **Outbreak alerts:** red banner if 5+ matching symptoms cluster within 2 km
  in 6 h.
- **Sort controls:** by urgency, time, or distance from your current GPS.
- **Optimise Route:** greedy nearest-neighbour pathing across your top 10
  patient visits.
- **Ranked patient table** with columns:
  Urgency · Symptoms · Channel · **Location (city)** · Distance · Time ·
  Cough signal · Status · **Action (🗑 delete)**
- Click the 🗑 on any row to remove a fake/duplicate report from the map
  instantly.

### Bottom section — Patient Reports
- Full filterable list with country → state → district → city cascading
  picker.
- Search, urgency / channel / time / outbreak filters.
- Sortable columns, pagination (25 per page).
- Click any row to open a detail drawer with full context, voice-stress
  reading, cough type, and advice.
- Per-row 🗑 trash icon, plus another in the detail drawer header.

### Auto-cleanup
Non-core reports self-expire so the map stays fresh:
- **Low** urgency older than **2 days** → auto-deleted
- **Medium** urgency older than **7 days** → auto-deleted
- **High** urgency and **outbreak-flagged** reports → kept

This runs on every dashboard load, no cron required.

---

## Tech stack

| Layer              | Tool                                                        |
|--------------------|-------------------------------------------------------------|
| Frontend           | Next.js 14 App Router, Tailwind, Leaflet + CartoDB tiles    |
| Backend            | FastAPI (Python) on port 8000                               |
| Database           | Supabase (PostgreSQL + real-time subscriptions)             |
| Auth               | Supabase Auth                                               |
| Speech-to-text     | Groq Whisper (`whisper-large-v3`)                           |
| Triage LLM         | Groq Llama 3.3 70B Versatile                                |
| Photo vision       | HuggingFace LLaVA 1.5 7B                                    |
| Cough detection    | Librosa MFCC + scikit-learn                                 |
| Text-to-speech     | gTTS (22 languages, no API key)                             |
| Telegram           | `python-telegram-bot` 21.5                                  |
| Email              | `imaplib` + `smtplib` via Gmail                             |
| Forecast / outbreak| Prophet (Meta)                                              |
| Clinic finder      | OpenStreetMap Overpass API                                  |
| Map tiles          | CartoDB Dark Matter (free)                                  |

All AI services used have generous free tiers. No credit card is required to
run the full stack.

---

## Running locally

### Prerequisites
- Node 18+
- Python 3.10+
- A Supabase project (free tier is fine)
- API keys: Groq, Gemini, HuggingFace, Telegram bot token, Gmail app password

### 1. Clone
```bash
git clone https://github.com/rohith-0099/arogyamap.git
cd arogyamap
```

### 2. Environment
Create `.env.local` in the repo root:
```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
HF_API_KEY=hf_...
TELEGRAM_TOKEN=123:ABC...
GMAIL_USER=youraddress@gmail.com
GMAIL_PASS=your-16-char-app-password
NEXT_PUBLIC_PYTHON_API_URL=http://localhost:8000
NEXT_PUBLIC_PY_API_URL=http://localhost:8000
```

### 3. Python backend
```bash
python3 -m venv .venv
.venv/bin/pip install -r server/requirements.txt
.venv/bin/python server/main.py
# → FastAPI on http://localhost:8000
```

### 4. Next.js frontend (new terminal)
```bash
cd client
npm install
npm run dev
# → http://localhost:3000
```

### 5. Optional — pan-India demo data
A local-only seeder covers 60+ Indian cities:
```bash
.venv/bin/python server/seed_india_live.py            # one-shot 80 reports
.venv/bin/python server/seed_india_live.py --live     # stream forever
.venv/bin/python server/seed_india_live.py --outbreak # force a cluster
```

> The seed scripts are in `.gitignore` — they exist only on your local clone.

---

## Self-hosting for free

The project is designed to run entirely on free tiers.

| Component | Host                   | Free tier                  |
|-----------|------------------------|----------------------------|
| Database  | Supabase               | 500 MB, 2 GB bandwidth     |
| Frontend  | Vercel                 | 100 GB bandwidth / mo      |
| Backend   | Render (Web Service)   | 750 hours / mo             |

**Deploy order:**

1. **Render** — new Web Service → root `server` → build
   `pip install -r requirements.txt` → start
   `uvicorn main:app --host 0.0.0.0 --port $PORT` → add all `.env.local`
   keys → copy the `.onrender.com` URL.
2. **Vercel** — import the repo → root `client` → paste the Render URL into
   `NEXT_PUBLIC_PYTHON_API_URL` and `NEXT_PUBLIC_PY_API_URL` → add Supabase
   envs → deploy.
3. **UptimeRobot** (optional) — ping `https://your-api.onrender.com/docs`
   every 5 min to keep Render awake.

Expected gotchas:
- **CORS:** make sure `server/main.py` allows your `*.vercel.app` origin.
- **Render 512 MB RAM:** `prophet` + `librosa` are heavy; lazy-import them if
  boot OOMs.
- **Cold start:** first request after 15 min idle takes ~30 s. UptimeRobot
  fixes this.

---

## Project layout

```
arogyamap/
├── client/                    Next.js 14 app
│   ├── app/
│   │   ├── page.jsx           Live home-page map
│   │   ├── report/            Voice + photo reporting UI
│   │   ├── dashboard/         ASHA worker dashboard
│   │   ├── analytics/         Trend charts
│   │   ├── login/             Supabase auth
│   │   └── api/               Next.js API routes (proxy to FastAPI)
│   ├── components/            MapView, Dashboard, PatientList, ReportForm …
│   └── lib/                   Supabase clients
├── server/                    FastAPI backend
│   ├── main.py                App entry point
│   ├── database.py            Supabase operations
│   ├── triage.py              Groq Llama triage
│   ├── photo.py               LLaVA vision
│   ├── acoustic.py            Cough + voice-stress ML
│   ├── outbreak_detector.py   2 km / 6 h cluster rule + Prophet
│   ├── telegram_bot.py        Telegram channel
│   ├── email_poller.py        Gmail channel
│   ├── tts_reply.py           gTTS voice replies
│   ├── clinic_finder.py       OSM Overpass nearest-clinic
│   ├── channel_router.py      Unified ingest pipeline
│   └── bulletin.py            Weekly summary generator
└── README.md
```

---

## Privacy

- GPS is rounded to a **500 m grid** before storage.
- User identity is an **MD5 hash** of channel + seed — no names, phones, or
  emails in the DB.
- `symptoms_raw` is private to the server. Only `symptoms_summary` is ever
  shown publicly.
- Row-level security (RLS) is enabled on the `reports` table.
- Reports auto-expire (see [auto-cleanup](#auto-cleanup)) so the live map
  always reflects recent disease signal, not stale history.

---

## License

MIT — use it, fork it, deploy it, save lives with it.

Built for rural healthcare in India.
