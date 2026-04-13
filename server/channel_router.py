"""Normalises all channel inputs to a standard processing format."""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ChannelInput:
    """Standardised input from any channel."""

    channel: str  # web | telegram | email
    audio_bytes: Optional[bytes] = None
    audio_filename: str = "audio.webm"
    text: Optional[str] = None
    photo_bytes: Optional[bytes] = None
    photo_mime: str = "image/jpeg"
    lat: Optional[float] = None
    lng: Optional[float] = None
    city: Optional[str] = None
    language_hint: str = "en"
    user_seed: str = ""  # For anonymisation hash


def from_web_form(
    audio_bytes: Optional[bytes],
    audio_filename: str,
    text: Optional[str],
    photo_bytes: Optional[bytes],
    photo_mime: str,
    lat: Optional[float],
    lng: Optional[float],
) -> ChannelInput:
    return ChannelInput(
        channel="web",
        audio_bytes=audio_bytes,
        audio_filename=audio_filename or "audio.webm",
        text=text,
        photo_bytes=photo_bytes,
        photo_mime=photo_mime or "image/jpeg",
        lat=lat,
        lng=lng,
    )


def from_telegram(
    audio_bytes: Optional[bytes],
    text: Optional[str],
    lat: Optional[float],
    lng: Optional[float],
    user_id: int,
) -> ChannelInput:
    return ChannelInput(
        channel="telegram",
        audio_bytes=audio_bytes,
        audio_filename="audio.ogg",
        text=text,
        lat=lat,
        lng=lng,
        user_seed=f"tg:{user_id}",
    )


def from_email(
    text: str,
    audio_bytes: Optional[bytes],
    audio_filename: Optional[str],
    city: Optional[str],
    sender_email: str,
) -> ChannelInput:
    import hashlib

    return ChannelInput(
        channel="email",
        audio_bytes=audio_bytes,
        audio_filename=audio_filename or "audio.ogg",
        text=text,
        city=city,
        user_seed=hashlib.md5(sender_email.encode()).hexdigest(),
    )
