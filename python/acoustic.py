"""Librosa MFCC cough detection + voice stress analysis."""

import io
import os
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np

# Lazy imports — librosa is heavy
_librosa = None
_sklearn_forest = None


def _get_librosa():
    global _librosa
    if _librosa is None:
        import librosa
        _librosa = librosa
    return _librosa


def analyse_audio(audio_bytes: bytes, filename: str = "audio.webm") -> dict:
    """
    Analyse audio for cough detection and voice stress.
    Returns dict with: has_cough, cough_type, voice_stress, speech_rate
    """
    try:
        return _analyse(audio_bytes, filename)
    except Exception as e:
        print(f"[acoustic] Analysis failed: {e}")
        return {
            "has_cough": False,
            "cough_type": "none",
            "voice_stress": 0.0,
            "speech_rate": 0.0,
        }


def _analyse(audio_bytes: bytes, filename: str) -> dict:
    librosa = _get_librosa()

    # Write to temp file (librosa can't read from bytes directly for all formats)
    suffix = Path(filename).suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        # Load audio — librosa handles webm/ogg via soundfile/audioread fallback
        y, sr = librosa.load(tmp_path, sr=22050, mono=True)
    finally:
        os.unlink(tmp_path)

    if len(y) == 0:
        return {"has_cough": False, "cough_type": "none", "voice_stress": 0.0, "speech_rate": 0.0}

    # --- MFCC extraction ---
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_mean = np.mean(mfcc, axis=1)  # (13,)
    mfcc_std = np.std(mfcc, axis=1)    # (13,)

    # --- Cough detection ---
    # High-energy short bursts: RMS energy
    frame_length = int(sr * 0.025)  # 25ms frames
    hop_length = int(sr * 0.010)    # 10ms hop

    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
    energy_threshold = 0.7 * np.max(rms)

    # Find frames above threshold
    high_energy_frames = rms > energy_threshold

    # Detect bursts (contiguous high-energy regions)
    bursts = _find_bursts(high_energy_frames, hop_length, sr)

    # Filter to cough duration range: 0.1s – 0.5s
    cough_bursts = [b for b in bursts if 0.08 <= b["duration"] <= 0.6]
    has_cough = len(cough_bursts) >= 1

    # --- Cough type classification ---
    cough_type = "none"
    if has_cough:
        cough_type = _classify_cough(mfcc_mean, mfcc_std, cough_bursts)

    # --- Voice stress (pitch variation) ---
    try:
        f0, voiced_flag, _ = librosa.pyin(
            y, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7")
        )
        voiced_f0 = f0[voiced_flag & ~np.isnan(f0)]
        if len(voiced_f0) > 10:
            pitch_std = float(np.std(voiced_f0))
            # Normalise: typical speaking pitch std is 20-80 Hz
            voice_stress = min(1.0, pitch_std / 100.0)
        else:
            voice_stress = 0.0
    except Exception:
        voice_stress = 0.0

    # --- Speech rate (zero-crossing rate proxy) ---
    zcr = librosa.feature.zero_crossing_rate(y)[0]
    speech_rate = float(np.mean(zcr) * sr / hop_length)

    return {
        "has_cough": has_cough,
        "cough_type": cough_type,
        "voice_stress": round(voice_stress, 3),
        "speech_rate": round(speech_rate, 2),
    }


def _find_bursts(high_energy_frames: np.ndarray, hop_length: int, sr: int) -> list[dict]:
    """Find contiguous high-energy burst regions."""
    bursts = []
    in_burst = False
    burst_start = 0

    for i, active in enumerate(high_energy_frames):
        if active and not in_burst:
            burst_start = i
            in_burst = True
        elif not active and in_burst:
            duration = (i - burst_start) * hop_length / sr
            bursts.append({"start": burst_start, "end": i, "duration": duration})
            in_burst = False

    if in_burst:
        duration = (len(high_energy_frames) - burst_start) * hop_length / sr
        bursts.append({"start": burst_start, "end": len(high_energy_frames), "duration": duration})

    return bursts


def _classify_cough(mfcc_mean: np.ndarray, mfcc_std: np.ndarray, cough_bursts: list) -> str:
    """
    Simple rule-based cough classifier using MFCC features.
    In production this would be a trained RandomForestClassifier.
    Rules based on acoustic literature:
    - Dry cough: short duration, high-frequency energy (high MFCC 4-6)
    - Wet cough: longer duration, low-frequency energy (high MFCC 1-3)
    - Whooping: repetitive pattern, distinctive pitch
    """
    if not cough_bursts:
        return "none"

    avg_duration = np.mean([b["duration"] for b in cough_bursts])
    mfcc1 = mfcc_mean[0] if len(mfcc_mean) > 0 else 0
    mfcc4 = mfcc_mean[3] if len(mfcc_mean) > 3 else 0

    if len(cough_bursts) >= 5 and avg_duration < 0.2:
        return "whooping"
    elif avg_duration < 0.25 and mfcc4 > mfcc1 * 0.3:
        return "dry"
    else:
        return "wet"
