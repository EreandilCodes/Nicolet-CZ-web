/**
 * aurora.js — Cursor-reactive ambient light system
 * Nicolet CZ · Scientific luxury · Restrained spectral atmosphere
 *
 * Two modes: public (fuller, 3 blobs) and admin (quieter, 2 blobs)
 * Degrades gracefully on touch, reduced-motion, and small viewports.
 */
(function () {
  'use strict';

  // ── Feature gates ──────────────────────────────────────────────────────────

  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Touch-only devices (no fine pointer = no hover cursor to track)
  const isTouchOnly =
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  // Small viewport — skip on mobile regardless
  if (prefersReducedMotion || isTouchOnly || window.innerWidth < 768) return;

  // ── DOM ────────────────────────────────────────────────────────────────────

  const layer = document.querySelector('.aurora-layer');
  if (!layer) return;

  const isAdmin = layer.classList.contains('aurora-layer--admin');
  const blobs   = Array.from(layer.querySelectorAll('.aurora-blob'));
  if (blobs.length === 0) return;

  // ── Configuration ──────────────────────────────────────────────────────────
  //
  // EASE: lerp factor per blob — lower = more inertia / slower tracking
  // OFFSET: resting spread so blobs "fan out" from cursor, giving depth
  //
  // Public:  3 blobs — responsive primary, drifting secondary, slowest tertiary
  // Admin:   2 blobs — slower, calmer, more utilitarian

  const EASE = isAdmin
    ? [0.040, 0.020]           // admin: calm / very calm
    : [0.072, 0.036, 0.018];   // public: responsive / drifting / slowest

  const OFFSET_X = isAdmin
    ? [  0,  200]
    : [  0,  240, -190];

  const OFFSET_Y = isAdmin
    ? [  0, -130]
    : [  0, -150,  200];

  // ── State ──────────────────────────────────────────────────────────────────

  // Mouse target — start at center so blobs have a valid initial position
  let mx = window.innerWidth  / 2;
  let my = window.innerHeight / 2;

  // Per-blob current positions (for lerp)
  const pos = blobs.map((_, i) => ({
    x: mx + (OFFSET_X[i] || 0),
    y: my + (OFFSET_Y[i] || 0),
  }));

  // Seed initial transforms immediately (no waiting for first frame)
  blobs.forEach((blob, i) => {
    blob.style.transform =
      `translate3d(calc(${pos[i].x}px - 50%), calc(${pos[i].y}px - 50%), 0)`;
  });

  // ── Event listeners ────────────────────────────────────────────────────────

  document.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
  }, { passive: true });

  // ── Animation loop ─────────────────────────────────────────────────────────

  let rafId = null;

  function tick() {
    rafId = requestAnimationFrame(tick);

    blobs.forEach((blob, i) => {
      const ease = EASE[i] || 0.04;
      const tx   = mx + (OFFSET_X[i] || 0);
      const ty   = my + (OFFSET_Y[i] || 0);

      // Lerp toward target
      pos[i].x += (tx - pos[i].x) * ease;
      pos[i].y += (ty - pos[i].y) * ease;

      // Only transform — no layout properties, no repaints
      blob.style.transform =
        `translate3d(calc(${pos[i].x}px - 50%), calc(${pos[i].y}px - 50%), 0)`;
    });
  }

  // ── Start / pause on visibility ────────────────────────────────────────────

  function start() { if (!rafId) tick(); }
  function stop()  { cancelAnimationFrame(rafId); rafId = null; }

  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : start();
  });

  start();

})();
