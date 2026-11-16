import React, { useEffect, useRef } from 'react';

interface TrailParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  decay: number;
  color: string;
}

interface BurstSpark {
  x: number;
  y: number;
  angle: number;
  speed: number;
  distance: number;
  length: number;
  width: number;
  alpha: number;
  decay: number;
  color: string;
  isDot: boolean;
}

interface PulseRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  rotation: number;
  color: string;
  secondaryColor: string;
}

const LIGHT_PALETTE = ['#2563eb', '#0ea5e9', '#d97706', '#059669'];
const DARK_PALETTE = ['#60a5fa', '#38bdf8', '#fbbf24', '#34d399'];

const INTERACTIVE_SELECTOR =
  'button, a, [role="button"], select, summary, label[for], input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="button"]';
const TEXT_INPUT_SELECTOR = 'input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="number"], textarea, [contenteditable="true"]';

export const CursorEffect: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.matches) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const finePointerQuery = window.matchMedia('(pointer: fine)');
    let hasFinePointer = finePointerQuery.matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();

    const trail: TrailParticle[] = [];
    const sparks: BurstSpark[] = [];
    const rings: PulseRing[] = [];

    let mouseX = -200;
    let mouseY = -200;
    let lastSpawnX = -200;
    let lastSpawnY = -200;
    let ringX = -200;
    let ringY = -200;
    let ringRadius = 13;
    let targetRadius = 13;
    let ringAlpha = 0;
    let targetAlpha = 0;
    let orbitAngle = 0;
    let isPointerInside = false;
    let isHoveringInteractive = false;
    let isHoveringText = false;
    let isPressed = false;
    let rafId: number | null = null;
    let lastMoveTime = 0;

    const isDarkTheme = () => document.documentElement.classList.contains('dark');
    const getPalette = () => (isDarkTheme() ? DARK_PALETTE : LIGHT_PALETTE);

    const scheduleRender = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    const spawnBurst = (x: number, y: number) => {
      const palette = getPalette();
      const baseColor = palette[0];
      const accentColor = palette[2];

      rings.push({
        x,
        y,
        radius: 5,
        maxRadius: 40,
        alpha: 0.9,
        rotation: Math.random() * Math.PI * 2,
        color: baseColor,
        secondaryColor: accentColor,
      });

      const sparkCount = 12;
      const offset = Math.random() * (Math.PI / sparkCount);
      for (let i = 0; i < sparkCount; i++) {
        const angle = offset + (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.14;
        const isDot = i % 2 === 1;
        sparks.push({
          x,
          y,
          angle,
          speed: isDot ? 2.6 + Math.random() * 1.4 : 3.2 + Math.random() * 1.8,
          distance: 5,
          length: isDot ? 2.4 : 7 + Math.random() * 4,
          width: isDot ? 2.2 : 1.9,
          alpha: 0.95,
          decay: isDot ? 0.032 : 0.036,
          color: palette[i % palette.length],
          isDot,
        });
      }

      scheduleRender();
    };

    const handlePointerMove = (e: PointerEvent) => {
      const fine = e.pointerType === 'mouse' || e.pointerType === 'pen';
      if (fine) {
        hasFinePointer = true;
      }

      mouseX = e.clientX;
      mouseY = e.clientY;
      lastMoveTime = performance.now();

      if (!isPointerInside) {
        isPointerInside = true;
        ringX = mouseX;
        ringY = mouseY;
        lastSpawnX = mouseX;
        lastSpawnY = mouseY;
      }

      const target = e.target as Element | null;
      isHoveringInteractive = Boolean(target?.closest?.(INTERACTIVE_SELECTOR));
      isHoveringText = Boolean(target?.closest?.(TEXT_INPUT_SELECTOR));

      if (fine) {
        targetAlpha = isHoveringText ? 0.28 : isHoveringInteractive ? 0.85 : 0.52;
        targetRadius = isPressed ? 10 : isHoveringInteractive ? 20 : 13;

        const dx = mouseX - lastSpawnX;
        const dy = mouseY - lastSpawnY;
        const dist = Math.hypot(dx, dy);

        if (dist >= 14 && trail.length < 28) {
          const palette = getPalette();
          const color = palette[Math.floor(Math.random() * palette.length)];
          trail.push({
            x: mouseX + (Math.random() - 0.5) * 4,
            y: mouseY + (Math.random() - 0.5) * 4,
            vx: -dx * 0.025 + (Math.random() - 0.5) * 0.35,
            vy: -dy * 0.025 + (Math.random() - 0.5) * 0.35,
            radius: isHoveringInteractive ? 2.3 : 1.8,
            alpha: isHoveringText ? 0.25 : 0.58,
            decay: 0.035,
            color,
          });
          lastSpawnX = mouseX;
          lastSpawnY = mouseY;
        }
      }

      scheduleRender();
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      isPressed = true;
      mouseX = e.clientX;
      mouseY = e.clientY;
      lastMoveTime = performance.now();
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        hasFinePointer = true;
        isPointerInside = true;
        targetRadius = 9.5;
        targetAlpha = 0.9;
      }
      spawnBurst(e.clientX, e.clientY);
    };

    const handlePointerUp = () => {
      isPressed = false;
      targetRadius = isHoveringInteractive ? 20 : 13;
      targetAlpha = isHoveringText ? 0.28 : isHoveringInteractive ? 0.85 : 0.52;
      scheduleRender();
    };

    const handlePointerLeave = () => {
      isPointerInside = false;
      isPressed = false;
      targetAlpha = 0;
      scheduleRender();
    };

    const renderFrame = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      const dark = isDarkTheme();

      // Smooth spring-damped follower reticle (desktop / stylus only)
      if (hasFinePointer) {
        ringX += (mouseX - ringX) * 0.22;
        ringY += (mouseY - ringY) * 0.22;
        ringRadius += (targetRadius - ringRadius) * 0.22;

        const isRecentlyActive = now - lastMoveTime < 1800;
        const desiredAlpha = isPointerInside && isRecentlyActive ? targetAlpha : 0;
        ringAlpha += (desiredAlpha - ringAlpha) * 0.14;
        orbitAngle += isHoveringInteractive ? 0.045 : 0.022;

        if (ringAlpha > 0.015) {
          ctx.save();
          ctx.translate(ringX, ringY);
          ctx.globalAlpha = ringAlpha;

          // Subtle ambient outer glow when over interactive controls
          if (isHoveringInteractive) {
            ctx.beginPath();
            ctx.arc(0, 0, ringRadius + 3, 0, Math.PI * 2);
            ctx.fillStyle = dark ? 'rgba(96, 165, 250, 0.12)' : 'rgba(37, 99, 235, 0.08)';
            ctx.fill();
          }

          // Primary crisp orbital reticle ring
          ctx.beginPath();
          ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
          ctx.lineWidth = isHoveringInteractive ? 1.6 : 1.25;
          ctx.strokeStyle = isHoveringInteractive
            ? dark
              ? '#60a5fa'
              : '#2563eb'
            : dark
            ? 'rgba(148, 163, 184, 0.72)'
            : 'rgba(30, 58, 138, 0.5)';
          ctx.stroke();

          // Two counter-orbiting micro satellite ticks
          for (let k = 0; k < 2; k++) {
            const satAngle = orbitAngle + k * Math.PI;
            const sx = Math.cos(satAngle) * ringRadius;
            const sy = Math.sin(satAngle) * ringRadius;
            ctx.beginPath();
            ctx.arc(sx, sy, isHoveringInteractive ? 2.1 : 1.6, 0, Math.PI * 2);
            ctx.fillStyle =
              k === 0
                ? dark
                  ? '#38bdf8'
                  : '#2563eb'
                : dark
                ? '#fbbf24'
                : '#d97706';
            ctx.fill();
          }

          ctx.restore();
        }
      }

      // Velocity-aware micro-mote trail
      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        p.radius *= 0.965;

        if (p.alpha <= 0.02 || p.radius <= 0.25) {
          trail.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
      }

      // Expanding dual-wave pulse rings on click / tap
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.radius += (r.maxRadius - r.radius) * 0.16;
        r.rotation += 0.06;
        r.alpha -= 0.032;

        if (r.alpha <= 0.02) {
          rings.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(r.x, r.y);

        // Outer solid shockwave ring
        ctx.globalAlpha = r.alpha * 0.72;
        ctx.beginPath();
        ctx.arc(0, 0, r.radius, 0, Math.PI * 2);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = r.color;
        ctx.stroke();

        // Inner rotating segmented orbital arc
        ctx.rotate(r.rotation);
        ctx.globalAlpha = r.alpha * 0.85;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, r.radius * 0.68, 0, Math.PI * 2);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = r.secondaryColor;
        ctx.stroke();

        ctx.restore();
      }

      // Tapered radial geometric sparks & orbital dots on click / tap
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.distance += s.speed;
        s.speed *= 0.91;
        s.alpha -= s.decay;

        if (s.alpha <= 0.02) {
          sparks.splice(i, 1);
          continue;
        }

        const sx = s.x + Math.cos(s.angle) * s.distance;
        const sy = s.y + Math.sin(s.angle) * s.distance;

        ctx.save();
        ctx.globalAlpha = s.alpha;
        if (s.isDot) {
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(0.8, s.length * s.alpha), 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
        } else {
          const ex = sx + Math.cos(s.angle) * (s.length * s.alpha);
          const ey = sy + Math.sin(s.angle) * (s.length * s.alpha);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.lineWidth = s.width;
          ctx.lineCap = 'round';
          ctx.strokeStyle = s.color;
          ctx.stroke();
        }
        ctx.restore();
      }

      const ringSettled =
        !hasFinePointer ||
        ((ringAlpha <= 0.015 || (Math.abs(mouseX - ringX) < 0.2 && Math.abs(mouseY - ringY) < 0.2 && now - lastMoveTime > 1900)) &&
          !isPressed);

      const hasActiveWork =
        trail.length > 0 ||
        sparks.length > 0 ||
        rings.length > 0 ||
        (hasFinePointer && !ringSettled && (isPointerInside || ringAlpha > 0.015));

      if (hasActiveWork) {
        rafId = window.requestAnimationFrame(renderFrame);
      } else {
        rafId = null;
      }
    };

    const reboundTimeouts = new WeakMap<HTMLElement, number>();

    const handleButtonClickRebound = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const btn = target?.closest?.('button, [role="button"]') as HTMLElement | null;
      if (!btn) return;
      if ((btn as HTMLButtonElement).disabled || btn.getAttribute('aria-disabled') === 'true') {
        return;
      }

      const prevTimer = reboundTimeouts.get(btn);
      if (prevTimer !== undefined) {
        window.clearTimeout(prevTimer);
      }

      btn.classList.remove('btn-click-rebound', 'btn-click-rebound-wide');
      void btn.offsetWidth;

      const animClass =
        btn.getBoundingClientRect().width > 340 ? 'btn-click-rebound-wide' : 'btn-click-rebound';
      btn.classList.add(animClass);

      const cleanup = () => {
        btn.classList.remove('btn-click-rebound', 'btn-click-rebound-wide');
        const t = reboundTimeouts.get(btn);
        if (t !== undefined) {
          window.clearTimeout(t);
          reboundTimeouts.delete(btn);
        }
      };

      btn.addEventListener('animationend', cleanup, { once: true });
      const fallbackTimer = window.setTimeout(cleanup, 420);
      reboundTimeouts.set(btn, fallbackTimer);
    };

    const handleFinePointerChange = (e: MediaQueryListEvent) => {
      hasFinePointer = e.matches;
      if (!hasFinePointer) {
        ringAlpha = 0;
        targetAlpha = 0;
      }
      scheduleRender();
    };

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
    window.addEventListener('click', handleButtonClickRebound, { capture: true, passive: true });
    document.addEventListener('pointerleave', handlePointerLeave);
    finePointerQuery.addEventListener('change', handleFinePointerChange);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('click', handleButtonClickRebound, { capture: true });
      document.removeEventListener('pointerleave', handlePointerLeave);
      finePointerQuery.removeEventListener('change', handleFinePointerChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999]"
    />
  );
};
