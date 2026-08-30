'use client';

import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-map-gl/maplibre';

interface WindParticle {
  x: number; // longitude
  y: number; // latitude
  age: number;
  maxAge: number;
  speed: number;
}

interface WindParticleLayerProps {
  enabled?: boolean;
  intensity?: number;
  speedMultiplier?: number;
  particleCount?: number;
  colorScheme?: 'wind' | 'fire' | 'thermal';
}

// Generate physical wind vector (u, v in degrees per frame) for any lon/lat in NorCal
function getWindVector(lon: number, lat: number, time: number) {
  // Pilot region: lon [-124, -120], lat [38, 42]
  const normX = (lon - (-124)) / 4;
  const normY = (lat - 38) / 4;

  // Pacific onshore westerlies curving through Golden Gate & Carquinez Strait into Central Valley
  // and descending Sierra Nevada foehn (Diablo) winds
  const coastalInflow = Math.sin(normY * Math.PI) * 0.0035;
  const valleyChannel = Math.cos(normX * Math.PI) * 0.0025;
  const mountainGust = Math.sin((normX * 3 + time * 0.001) + normY * 2) * 0.0015;

  // Base westerly flow (u: east, v: north)
  let u = 0.0045 + coastalInflow + mountainGust;
  let v = -0.0015 + valleyChannel + Math.sin(time * 0.0008 + normX * 4) * 0.001;

  // Wind speed in km/h estimate
  const speed = Math.sqrt(u * u + v * v) * 8000;

  return { u, v, speed };
}

// Map speed to Windy.com vibrant neon gradient
function getWindColor(speed: number, scheme: 'wind' | 'fire' | 'thermal'): string {
  if (scheme === 'fire') {
    if (speed < 15) return 'rgba(251, 146, 60, 0.6)';
    if (speed < 30) return 'rgba(249, 115, 22, 0.8)';
    if (speed < 45) return 'rgba(239, 68, 68, 0.9)';
    return 'rgba(217, 70, 239, 0.95)';
  }
  // Standard Windy turquoise -> cyan -> lime -> yellow -> magenta
  if (speed < 10) return 'rgba(147, 197, 253, 0.55)'; // light blue
  if (speed < 20) return 'rgba(56, 189, 248, 0.75)';  // cyan
  if (speed < 35) return 'rgba(74, 222, 128, 0.85)';  // vibrant green
  if (speed < 48) return 'rgba(250, 204, 21, 0.9)';   // amber yellow
  if (speed < 60) return 'rgba(249, 115, 22, 0.95)';  // orange
  return 'rgba(236, 72, 153, 1.0)';                    // pink/magenta
}

export function WindParticleLayer({
  enabled = true,
  intensity = 1.0,
  speedMultiplier = 1.0,
  particleCount = 1800,
  colorScheme = 'wind',
}: WindParticleLayerProps) {
  const { current: map } = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<WindParticle[]>([]);

  useEffect(() => {
    if (!map || !enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to match map container dimensions
    const resize = () => {
      const container = map.getContainer();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    map.on('resize', resize);

    // Initialize particles across Northern California bounds
    const particles: WindParticle[] = [];
    const minLon = -124.5;
    const maxLon = -119.5;
    const minLat = 37.5;
    const maxLat = 42.5;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: minLon + Math.random() * (maxLon - minLon),
        y: minLat + Math.random() * (maxLat - minLat),
        age: Math.floor(Math.random() * 80),
        maxAge: 60 + Math.floor(Math.random() * 60),
        speed: 15,
      });
    }
    particlesRef.current = particles;

    let startTime = Date.now();

    // Animation Loop
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const width = map.getContainer().clientWidth;
      const height = map.getContainer().clientHeight;

      // Fading background for silky wind trails
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.94)';
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 1.6 * intensity;
      ctx.lineCap = 'round';

      const bounds = map.getBounds();
      const bMinLon = bounds ? bounds.getWest() - 0.5 : minLon;
      const bMaxLon = bounds ? bounds.getEast() + 0.5 : maxLon;
      const bMinLat = bounds ? bounds.getSouth() - 0.5 : minLat;
      const bMaxLat = bounds ? bounds.getNorth() + 0.5 : maxLat;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Project geographic coordinate to canvas pixel
        const screenPos = map.project([p.x, p.y]);

        const { u, v, speed } = getWindVector(p.x, p.y, elapsed);
        p.speed = speed;

        const nextLon = p.x + u * speedMultiplier;
        const nextLat = p.y + v * speedMultiplier;
        const nextScreenPos = map.project([nextLon, nextLat]);

        // Draw particle trail
        ctx.strokeStyle = getWindColor(speed, colorScheme);
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(nextScreenPos.x, nextScreenPos.y);
        ctx.stroke();

        p.x = nextLon;
        p.y = nextLat;
        p.age++;

        // Reset particle if expired or out of bounds
        if (
          p.age >= p.maxAge ||
          p.x < bMinLon ||
          p.x > bMaxLon ||
          p.y < bMinLat ||
          p.y > bMaxLat
        ) {
          p.x = bMinLon + Math.random() * (bMaxLon - bMinLon);
          p.y = bMinLat + Math.random() * (bMaxLat - bMinLat);
          p.age = 0;
          p.maxAge = 50 + Math.floor(Math.random() * 60);
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      map.off('resize', resize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [map, enabled, intensity, speedMultiplier, particleCount, colorScheme]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10 w-full h-full"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}
