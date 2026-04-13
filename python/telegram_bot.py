"""Telegram bot channel — receives voice/text, returns triage results."""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
    ContextTypes,
)

from channel_router import from_telegram
from triage import triage_audio, triage_text
from acoustic import analyse_audio
from clinic_finder import find_nearest_clinics, format_clinics_text
from tts_reply import generate_voice_reply
from database import insert_report, update_follow_up, mark_follow_up_sent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TOKEN = os.getenv("TELEGRAM_TOKEN", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://arogyamap.vercel.app")

URGENCY_EMOJI = {"high": "🚨", "medium": "⚠️", "low": "✅"}
URGENCY_ACTION = {
    "high": "Go to the nearest emergency room NOW",
    "medium": "Visit a doctor within the next few days",
    "low": "Rest at home and monitor your symptoms",
}

# In-memory session state {user_id: {lat, lng, last_report_id}}
_sessions: dict[int, dict] = {}


def _format_reply(triage: dict, clinics: list[dict]) -> str:
    urgency = triage.get("urgency", "low")
    emoji = URGENCY_EMOJI.get(urgency, "ℹ️")
    action = URGENCY_ACTION.get(urgency, "")

    lines = [
        f"{emoji} *Urgency: {urgency.upper()}*",
        "",
        f"*Symptoms:* {triage.get('symptoms_summary', 'unspecified')}",
        "",
        f"*Advice:* {triage.get('advice', 'Please consult a doctor.')}",
        "",
        f"*Action:* {action}",
    ]

    if clinics:
        lines.append("")
        lines.append("🏥 *Nearest facility:*")
        c = clinics[0]
        lines.append(f"{c['name']} — {c['distance_km']} km")
        lines.append(c["maps_url"])

    lines.extend([
        "",
        f"🗺️ [View live disease map]({FRONTEND_URL})",
        "_Your anonymous report is now live on the map._",
    ])

    return "\n".join(lines)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = (
        "🏥 *Welcome to ArogyaMap*\n\n"
        "Report your symptoms anonymously to help protect your community.\n\n"
        "*How to use:*\n"
        "• Send a *voice message* describing your symptoms\n"
        "• Or *type* your symptoms in any language\n"
        "• Share your *location* for nearest clinic info\n\n"
        "*Commands:*\n"
        "/map — View live disease map\n"
        "/asha — ASHA worker dashboard\n"
        "/help — Show this message\n\n"
        "_All reports are anonymous. No personal data stored._"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


async def cmd_map(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        f"🗺️ Live Disease Map: {FRONTEND_URL}",
        parse_mode="Markdown",
    )


async def cmd_asha(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        f"🏥 ASHA Dashboard: {FRONTEND_URL}/dashboard",
        parse_mode="Markdown",
    )


async def handle_location(update: Update, context: ContextTypes.DEFAULT_TYPE):
    loc = update.message.location
    user_id = update.effective_user.id
    _sessions.setdefault(user_id, {})
    # Round to 500m grid for privacy
    _sessions[user_id]["lat"] = round(loc.latitude * 200) / 200
    _sessions[user_id]["lng"] = round(loc.longitude * 200) / 200
    await update.message.reply_text(
        "📍 Location captured. Now send your symptoms as a voice message or text."
    )


async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    session = _sessions.get(user_id, {})

    await update.message.reply_text("🎙️ Processing your voice message…")

    try:
        voice = update.message.voice or update.message.audio
        voice_file = await context.bot.get_file(voice.file_id)
        audio_bytes = await voice_file.download_as_bytearray()
        audio_bytes = bytes(audio_bytes)

        # Acoustic analysis
        acoustic = analyse_audio(audio_bytes, "audio.ogg")

        # Triage
        triage = triage_audio(audio_bytes, "audio.ogg")

        await _process_and_reply(
            update, context, triage, acoustic, audio_bytes, session, user_id
        )
    except Exception as e:
        logger.error(f"Voice handler error: {e}")
        await update.message.reply_text(
            "Sorry, I couldn't process your voice message. Please try typing your symptoms."
        )


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text
    if text and text.startswith("/"):
        return  # Handled by command handlers

    user_id = update.effective_user.id
    session = _sessions.get(user_id, {})

    # Check if this is a follow-up response
    last_report_id = session.get("last_report_id")
    if last_report_id and text.strip().lower() in ("better", "same", "worse"):
        status = text.strip().lower()
        try:
            update_follow_up(last_report_id, status)
        except Exception:
            pass
        responses = {
            "better": "Glad to hear you're feeling better! 🎉",
            "same": "Thank you for the update. If you don't improve, please see a doctor. 🏥",
            "worse": "Please seek medical attention immediately. Call 104 for assistance. 🚨",
        }
        await update.message.reply_text(responses[status])
        return

    await update.message.reply_text("⏳ Analysing symptoms…")

    try:
        triage = triage_text(text)
        await _process_and_reply(
            update, context, triage, {}, None, session, user_id
        )
    except Exception as e:
        logger.error(f"Text handler error: {e}")
        await update.message.reply_text(
            "Sorry, something went wrong. Please try again."
        )


async def _process_and_reply(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    triage: dict,
    acoustic: dict,
    audio_bytes,
    session: dict,
    user_id: int,
):
    lat = session.get("lat")
    lng = session.get("lng")
    urgency = triage.get("urgency", "low")
    language = triage.get("detected_language", "en")

    # Find clinics if we have location
    clinics = []
    if lat and lng:
        try:
            clinics = find_nearest_clinics(lat, lng)
        except Exception:
            pass

    # Save to DB
    try:
        row = insert_report(
            channel="telegram",
            symptoms_raw=triage.get("transcription", ""),
            symptoms_summary=triage.get("symptoms_summary", "unspecified"),
            urgency=urgency,
            advice=triage.get("advice", ""),
            lat=lat,
            lng=lng,
            has_cough=acoustic.get("has_cough", False),
            voice_stress=acoustic.get("voice_stress", 0.0),
            cough_type=acoustic.get("cough_type", "none"),
            language=language,
            user_seed=f"tg:{user_id}",
        )
        report_id = row.get("id")
        _sessions.setdefault(user_id, {})["last_report_id"] = report_id
    except Exception as e:
        logger.error(f"DB insert error: {e}")
        report_id = None

    # Send text reply
    reply_text = _format_reply(triage, clinics)
    await update.message.reply_text(reply_text, parse_mode="Markdown")

    # Send nearest clinic location pin
    if clinics and lat:
        c = clinics[0]
        try:
            await context.bot.send_location(
                chat_id=update.effective_chat.id,
                latitude=c["lat"],
                longitude=c["lng"],
            )
        except Exception:
            pass

    # Send voice reply
    try:
        advice_text = triage.get("advice", "Please consult a doctor if symptoms persist.")
        voice_bytes = generate_voice_reply(advice_text, language)
        if voice_bytes:
            import io
            await context.bot.send_voice(
                chat_id=update.effective_chat.id,
                voice=io.BytesIO(voice_bytes),
                caption="🎙️ Voice advice",
            )
    except Exception as e:
        logger.debug(f"Voice reply error: {e}")

    # Schedule 24h follow-up for high/medium urgency
    if urgency in ("high", "medium") and report_id:
        follow_up_delay = 86400  # 24 hours
        context.job_queue.run_once(
            _send_follow_up,
            when=follow_up_delay,
            data={
                "chat_id": update.effective_chat.id,
                "report_id": report_id,
                "user_id": user_id,
            },
        )


async def _send_follow_up(context: ContextTypes.DEFAULT_TYPE):
    data = context.job.data
    try:
        mark_follow_up_sent(data["report_id"])
        keyboard = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("Better ✅", callback_data=f"fu_better_{data['report_id']}"),
                InlineKeyboardButton("Same ⚠️", callback_data=f"fu_same_{data['report_id']}"),
                InlineKeyboardButton("Worse 🚨", callback_data=f"fu_worse_{data['report_id']}"),
            ]
        ])
        await context.bot.send_message(
            chat_id=data["chat_id"],
            text="How are you feeling today? Reply to help us track community health.",
            reply_markup=keyboard,
        )
    except Exception as e:
        logger.error(f"Follow-up send error: {e}")


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data.startswith("fu_"):
        parts = data.split("_")
        status = parts[1]
        report_id = int(parts[2])
        try:
            update_follow_up(report_id, status)
        except Exception:
            pass
        responses = {
            "better": "Great news! Glad you're feeling better. 🎉",
            "same": "Thank you. Please see a doctor if no improvement soon. 🏥",
            "worse": "Please seek medical care immediately. Call 104. 🚨",
        }
        await query.edit_message_text(responses.get(status, "Thank you for the update."))


def build_app() -> Application:
    app = (
        Application.builder()
        .token(TOKEN)
        .build()
    )

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_start))
    app.add_handler(CommandHandler("map", cmd_map))
    app.add_handler(CommandHandler("asha", cmd_asha))
    app.add_handler(MessageHandler(filters.LOCATION, handle_location))
    app.add_handler(MessageHandler(filters.VOICE | filters.AUDIO, handle_voice))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    app.add_handler(CallbackQueryHandler(handle_callback))

    return app


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    app = build_app()
    logger.info("Starting Telegram bot…")
    app.run_polling(drop_pending_updates=True)
