"""Gmail IMAP poller + SMTP reply sender."""

import email
import imaplib
import io
import logging
import os
import re
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.audio import MIMEAudio
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

from channel_router import from_email
from triage import triage_audio, triage_text
from acoustic import analyse_audio
from clinic_finder import find_nearest_clinics, format_clinics_text
from tts_reply import generate_voice_reply
from database import insert_report
from utils.location import resolve_location

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_PASS = os.getenv("GMAIL_PASS", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://arogyamap.vercel.app")
POLL_INTERVAL = 60  # seconds

URGENCY_LABELS = {
    "high": "🚨 URGENT — Go to Emergency Now",
    "medium": "⚠️ Medium — See Doctor This Week",
    "low": "✅ Low — Rest at Home",
}

AUDIO_EXTENSIONS = {".ogg", ".mp3", ".wav", ".m4a", ".webm", ".opus"}


def _connect_imap() -> imaplib.IMAP4_SSL:
    mail = imaplib.IMAP4_SSL("imap.gmail.com")
    mail.login(GMAIL_USER, GMAIL_PASS)
    return mail





def _process_message(msg) -> None:
    """Extract content from email message and process it."""
    sender = msg.get("From", "")
    subject = msg.get("Subject", "")

    # Extract sender email
    match = re.search(r"[\w.+-]+@[\w-]+\.[a-z.]+", sender)
    sender_email = match.group() if match else "unknown@unknown.com"

    body_text = ""
    audio_bytes = None
    audio_filename = None

    # Parse parts
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            filename = part.get_filename() or ""
            disposition = str(part.get("Content-Disposition") or "")

            if content_type == "text/plain" and "attachment" not in disposition:
                try:
                    body_text = part.get_payload(decode=True).decode("utf-8", errors="replace")
                except Exception:
                    pass

            # Audio attachment
            ext = os.path.splitext(filename)[1].lower()
            if ext in AUDIO_EXTENSIONS or content_type.startswith("audio/"):
                try:
                    audio_bytes = part.get_payload(decode=True)
                    audio_filename = filename or f"audio{ext or '.ogg'}"
                    logger.info(f"Found audio attachment: {audio_filename}")
                except Exception:
                    pass
    else:
        try:
            body_text = msg.get_payload(decode=True).decode("utf-8", errors="replace")
        except Exception:
            pass

    # Combine subject + body for symptom text
    symptom_text = f"{subject} {body_text}".strip()
    if not symptom_text and not audio_bytes:
        logger.info("Empty email, skipping")
        return

    # Resolve location (hierarchy aware)
    location = resolve_location(text=symptom_text)

    # Build channel input
    channel_input = from_email(
        text=symptom_text,
        audio_bytes=audio_bytes,
        audio_filename=audio_filename,
        city=location.get("city"),
        sender_email=sender_email,
    )

    # Triage
    if audio_bytes:
        triage = triage_audio(audio_bytes, audio_filename or "audio.ogg")
        acoustic = analyse_audio(audio_bytes, audio_filename or "audio.ogg")
    else:
        triage = triage_text(symptom_text)
        acoustic = {}

    urgency = triage.get("urgency", "low")
    language = triage.get("detected_language", "en")

    # Find clinics (no GPS for email, use city coords if known)
    clinics = []

    # Save to DB
    try:
        insert_report(
            channel="email",
            symptoms_raw=symptom_text[:500],
            symptoms_summary=triage.get("symptoms_summary", "unspecified"),
            urgency=urgency,
            advice=triage.get("advice", ""),
            lat=location.get("lat"),
            lng=location.get("lng"),
            city=location.get("city") or "",
            zone_name=location.get("zone_name"),
            district=location.get("district"),
            state=location.get("state"),
            country=location.get("country"),
            resolution_method=location.get("resolution_method", "unassigned"),
            has_cough=acoustic.get("has_cough", False),
            voice_stress=acoustic.get("voice_stress", 0.0),
            cough_type=acoustic.get("cough_type", "none"),
            language=language,
            user_seed=channel_input.user_seed,
        )
    except Exception as e:
        logger.error(f"DB insert error: {e}")

    # Send reply
    _send_reply(sender_email, triage, clinics)


def _send_reply(to_email: str, triage: dict, clinics: list) -> None:
    urgency = triage.get("urgency", "low")
    advice = triage.get("advice", "Please consult a doctor if symptoms persist.")
    language = triage.get("detected_language", "en")

    body = f"""ArogyaMap — Symptom Report Received
{'=' * 40}

Urgency: {URGENCY_LABELS.get(urgency, urgency.upper())}

Symptoms Detected: {triage.get('symptoms_summary', 'unspecified')}

Advice: {advice}

View Live Disease Map: {FRONTEND_URL}

{format_clinics_text(clinics) if clinics else ''}

---
Call 104 for free National Health Helpline (India)
This report is anonymous. ArogyaMap — Community Disease Intelligence
"""

    msg = MIMEMultipart()
    msg["From"] = GMAIL_USER
    msg["To"] = to_email
    msg["Subject"] = f"[ArogyaMap] Your report: {URGENCY_LABELS.get(urgency, urgency)}"
    msg.attach(MIMEText(body, "plain"))

    # Attach voice reply
    try:
        voice_bytes = generate_voice_reply(advice, language)
        if voice_bytes:
            audio_part = MIMEAudio(voice_bytes, _subtype="mpeg")
            audio_part.add_header(
                "Content-Disposition", "attachment", filename="advice.mp3"
            )
            msg.attach(audio_part)
    except Exception as e:
        logger.debug(f"Voice reply attachment error: {e}")

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_PASS)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())
        logger.info(f"Reply sent to {to_email}")
    except Exception as e:
        logger.error(f"SMTP send error: {e}")


def poll_once() -> int:
    """Poll inbox once. Returns number of emails processed."""
    processed = 0
    try:
        mail = _connect_imap()
        mail.select("INBOX")

        # Search for unread emails
        _, data = mail.search(None, "UNSEEN")
        email_ids = data[0].split()

        for eid in email_ids:
            try:
                _, msg_data = mail.fetch(eid, "(RFC822)")
                raw = msg_data[0][1]
                msg = email.message_from_bytes(raw)
                _process_message(msg)
                mail.store(eid, "+FLAGS", "\\Seen")
                processed += 1
            except Exception as e:
                logger.error(f"Error processing email {eid}: {e}")

        mail.close()
        mail.logout()
    except Exception as e:
        logger.error(f"IMAP poll error: {e}")

    return processed


def run_forever():
    """Poll Gmail inbox every 60 seconds indefinitely."""
    logger.info(f"Email poller started. Checking every {POLL_INTERVAL}s")
    while True:
        try:
            count = poll_once()
            if count > 0:
                logger.info(f"Processed {count} email(s)")
        except Exception as e:
            logger.error(f"Poll loop error: {e}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    run_forever()
