"use client";

import { useEffect, useRef } from "react";

/**
 * Globe of particles orbiting the mic button. Particles sit on the surface
 * of a 3D sphere and rotate smoothly; live mic volume pulses the radius
 * and brightness so the globe "breathes" with the voice.
 */
export default function MicParticles({ active, size = 300 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const particlesRef = useRef([]);
  const stateRef = useRef({ angleY: 0, angleX: 0, volume: 0, smoothVol: 0 });
  const themeRef = useRef("dark");

  useEffect(() => {
    const read = () => {
      if (typeof window === "undefined") return;
      const saved = localStorage.getItem("app-theme") || localStorage.getItem("map-theme");
      themeRef.current = saved === "light" ? "light" : "dark";
    };
    read();
    window.addEventListener("storage", read);
    const iv = setInterval(read, 500);
    return () => {
      window.removeEventListener("storage", read);
      clearInterval(iv);
    };
  }, []);

  // Build a fibonacci-sphere of unit particles once
  useEffect(() => {
    const N = 180;
    const pts = [];
    const phi = Math.PI * (Math.sqrt(5) - 1);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = phi * i;
      pts.push({
        x: Math.cos(theta) * r,
        y,
        z: Math.sin(theta) * r,
      });
    }
    particlesRef.current = pts;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startMic() {
      if (!active) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const AC = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AC();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.85;
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch (err) {
        console.warn("MicParticles: mic access denied", err);
      }
    }

    function loop() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      // Volume reading
      let volume = 0;
      const analyser = analyserRef.current;
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        volume = Math.min(1, sum / data.length / 90);
      }
      const s = stateRef.current;
      s.smoothVol += (volume - s.smoothVol) * 0.15;

      // Idle (no audio yet) → gentle breathing
      const breathing = active && !analyser ? (Math.sin(Date.now() / 600) + 1) * 0.15 : 0;
      const vol = Math.max(s.smoothVol, breathing);

      // Rotation — speeds up slightly with voice
      s.angleY += 0.0055 + vol * 0.012;
      s.angleX += 0.0022 + vol * 0.004;

      const baseR = 82;
      const radius = baseR + vol * 22;

      ctx.clearRect(0, 0, w, h);

      // Theme-aware base color
      const isDark = themeRef.current === "dark";
      const base = isDark ? "255,255,255" : "20,20,20";

      // Soft outer halo
      const haloR = radius + 26;
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, haloR);
      halo.addColorStop(0, `rgba(${base},0)`);
      halo.addColorStop(0.6, `rgba(${base},${0.08 + vol * 0.2})`);
      halo.addColorStop(1, `rgba(${base},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Project every particle
      const sinY = Math.sin(s.angleY);
      const cosY = Math.cos(s.angleY);
      const sinX = Math.sin(s.angleX);
      const cosX = Math.cos(s.angleX);

      const projected = [];
      for (const p of particlesRef.current) {
        // Rotate around Y
        let x = p.x * cosY - p.z * sinY;
        let z = p.x * sinY + p.z * cosY;
        let y = p.y;
        // Rotate around X
        const y2 = y * cosX - z * sinX;
        const z2 = y * sinX + z * cosX;
        y = y2;
        z = z2;

        projected.push({ x, y, z });
      }

      // Sort back-to-front for nicer depth
      projected.sort((a, b) => a.z - b.z);

      for (const p of projected) {
        const depth = (p.z + 1) / 2; // 0 (back) → 1 (front)
        const px = cx + p.x * radius;
        const py = cy + p.y * radius;
        const sz = 0.6 + depth * 2.2 + vol * 1.4;
        const alpha = 0.25 + depth * 0.75;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${base},${alpha})`;
        ctx.shadowBlur = 6 + depth * 6;
        ctx.shadowColor = `rgba(${base},${alpha})`;
        ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Equator ring for globe feel
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${base},${0.12 + vol * 0.2})`;
      ctx.lineWidth = 1;
      ctx.ellipse(cx, cy, radius, radius * Math.abs(Math.sin(s.angleX)) + 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      rafRef.current = requestAnimationFrame(loop);
    }

    if (active) {
      startMic();
      rafRef.current = requestAnimationFrame(loop);
    } else {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
      analyserRef.current = null;
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="absolute pointer-events-none"
      style={{
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        opacity: active ? 1 : 0,
        transition: "opacity 400ms",
      }}
    />
  );
}
