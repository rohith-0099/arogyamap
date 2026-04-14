# Dockerfile for Hugging Face Spaces (Docker SDK)
# 16 GB RAM free tier — fits prophet + librosa + sklearn + telegram bot comfortably.
FROM python:3.11-slim

# System deps: build tools for prophet/cmdstan, audio libs for librosa
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        g++ \
        libsndfile1 \
        ffmpeg \
        curl \
    && rm -rf /var/lib/apt/lists/*

# HF Spaces requires the container to run as UID 1000
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:${PATH}"
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install Python deps first for better layer caching
COPY --chown=user server/requirements.txt ./requirements.txt
RUN pip install --user --upgrade pip \
 && pip install --user -r requirements.txt

# App code
COPY --chown=user server/ ./server/

ENV PYTHONPATH=/app/server

# Default background channels ON for HF (plenty of RAM)
ENV ENABLE_TELEGRAM=1
ENV ENABLE_EMAIL=1
ENV ENABLE_OUTBREAK=1

# HF Spaces exposes port 7860 by convention
EXPOSE 7860

WORKDIR /app/server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
