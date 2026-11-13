import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ExtractedColor } from '../types/toolkit';

interface ThreeHeroCanvasProps {
  palette: ExtractedColor[];
  isDark: boolean;
}

type PaletteCardVariant = 'strip-5' | 'grid-2x2' | 'strip-4' | 'vertical-3';

const CURATED_PALETTES: string[][] = [
  ['#0F172A', '#1E40AF', '#3B82F6', '#60A5FA', '#DBEAFE'],
  ['#18181B', '#3F6253', '#52796F', '#84A98C', '#CAD2C5'],
  ['#3B0764', '#7E22CE', '#A855F7', '#D8B4FE', '#F3E8FF'],
  ['#431407', '#9A3412', '#EA580C', '#FB923C', '#FFEDD5'],
  ['#064E3B', '#047857', '#10B981', '#6EE7B7', '#D1FAE5'],
  ['#1E1B4B', '#3730A3', '#6366F1', '#818CF8', '#E0E7FF'],
  ['#4C0519', '#9F1239', '#E11D48', '#FDA4AF', '#FFE4E6'],
  ['#0C4A6E', '#0369A1', '#0EA5E9', '#7DD3FC', '#E0F2FE'],
  ['#1C1917', '#44403C', '#78716C', '#D6D3D1', '#F5F5F4'],
  ['#312E81', '#4F46E5', '#14B8A6', '#F59E0B', '#F43F5E'],
  ['#111827', '#374151', '#6B7280', '#9CA3AF', '#F3F4F6'],
  ['#134E4A', '#0F766E', '#2DD4BF', '#99F6E4', '#F0FDFA'],
];

/**
 * Renders a crisp, anti-aliased palette card texture onto an offscreen canvas
 * so each 3D floating palette is a single fast GPU draw call with zero z-fighting.
 */
function createPaletteCardTexture(
  colors: string[],
  variant: PaletteCardVariant,
  isDark: boolean
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  if (variant === 'strip-5' || variant === 'strip-4') {
    canvas.width = 512;
    canvas.height = 160;
  } else if (variant === 'vertical-3') {
    canvas.width = 192;
    canvas.height = 384;
  } else {
    canvas.width = 280;
    canvas.height = 280;
  }

  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  // Card frame background
  ctx.fillStyle = isDark ? '#1A1A22' : '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 24);
  ctx.fill();

  // Subtle border stroke
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(9,9,11,0.08)';
  ctx.lineWidth = 4;
  ctx.stroke();

  const pad = 18;
  const gap = 12;

  if (variant === 'strip-5' || variant === 'strip-4') {
    const count = variant === 'strip-5' ? 5 : 4;
    const availW = w - pad * 2 - gap * (count - 1);
    const swW = availW / count;
    const swH = h - pad * 2;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.roundRect(pad + i * (swW + gap), pad, swW, swH, 14);
      ctx.fill();
    }
  } else if (variant === 'vertical-3') {
    const count = 3;
    const availH = h - pad * 2 - gap * (count - 1);
    const swW = w - pad * 2;
    const swH = availH / count;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.roundRect(pad, pad + i * (swH + gap), swW, swH, 14);
      ctx.fill();
    }
  } else {
    // 2x2 grid
    const swW = (w - pad * 2 - gap) / 2;
    const swH = (h - pad * 2 - gap) / 2;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const idx = r * 2 + c;
        ctx.fillStyle = colors[idx % colors.length];
        ctx.beginPath();
        ctx.roundRect(
          pad + c * (swW + gap),
          pad + r * (swH + gap),
          swW,
          swH,
          16
        );
        ctx.fill();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

interface PalettePlacement {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  variant: PaletteCardVariant;
  speed: number;
  phase: number;
  syncActive?: boolean;
}

const PALETTE_PLACEMENTS: PalettePlacement[] = [
  // Outer Left Column
  { x: -5.4, y: 2.3, z: -1.6, rx: 0.18, ry: 0.34, rz: -0.12, scale: 0.92, variant: 'strip-5', speed: 0.55, phase: 0.2, syncActive: true },
  { x: -4.8, y: 0.3, z: -2.4, rx: -0.14, ry: 0.28, rz: 0.08, scale: 0.85, variant: 'grid-2x2', speed: 0.48, phase: 1.4 },
  { x: -5.2, y: -1.8, z: -1.5, rx: 0.2, ry: 0.3, rz: 0.14, scale: 0.9, variant: 'strip-4', speed: 0.6, phase: 2.7, syncActive: true },
  { x: -3.5, y: -2.7, z: -2.8, rx: 0.12, ry: 0.18, rz: -0.1, scale: 0.78, variant: 'vertical-3', speed: 0.5, phase: 3.9 },

  // Outer Right Column
  { x: 5.3, y: 2.2, z: -1.7, rx: -0.16, ry: -0.34, rz: 0.11, scale: 0.92, variant: 'strip-5', speed: 0.52, phase: 0.8 },
  { x: 4.9, y: 0.1, z: -2.2, rx: 0.15, ry: -0.28, rz: -0.09, scale: 0.86, variant: 'grid-2x2', speed: 0.58, phase: 2.1, syncActive: true },
  { x: 5.1, y: -1.9, z: -1.6, rx: -0.2, ry: -0.32, rz: -0.12, scale: 0.9, variant: 'strip-5', speed: 0.46, phase: 3.3 },
  { x: 3.6, y: 2.7, z: -2.9, rx: -0.14, ry: -0.2, rz: 0.08, scale: 0.78, variant: 'vertical-3', speed: 0.54, phase: 4.5 },

  // Mid-Background Ring
  { x: -2.7, y: 2.5, z: -3.2, rx: 0.24, ry: 0.15, rz: -0.08, scale: 0.82, variant: 'strip-4', speed: 0.44, phase: 1.1 },
  { x: 2.5, y: -2.5, z: -3.1, rx: -0.22, ry: -0.16, rz: 0.1, scale: 0.84, variant: 'strip-5', speed: 0.5, phase: 2.5, syncActive: true },
  { x: -0.2, y: 2.85, z: -3.6, rx: 0.26, ry: -0.05, rz: 0.04, scale: 0.76, variant: 'strip-5', speed: 0.42, phase: 3.7 },
  { x: 0.4, y: -2.8, z: -3.5, rx: -0.24, ry: 0.08, rz: -0.06, scale: 0.78, variant: 'grid-2x2', speed: 0.47, phase: 5.0 },

  // Deep Atmospheric Layer
  { x: -3.6, y: 1.2, z: -4.4, rx: 0.15, ry: 0.22, rz: -0.15, scale: 0.75, variant: 'strip-5', speed: 0.38, phase: 0.6 },
  { x: 3.7, y: -0.9, z: -4.3, rx: -0.18, ry: -0.24, rz: 0.14, scale: 0.75, variant: 'strip-4', speed: 0.4, phase: 1.9 },
  { x: -1.9, y: -1.3, z: -4.8, rx: 0.12, ry: 0.14, rz: 0.08, scale: 0.7, variant: 'grid-2x2', speed: 0.36, phase: 3.1, syncActive: true },
  { x: 1.8, y: 1.35, z: -4.7, rx: -0.14, ry: -0.15, rz: -0.07, scale: 0.7, variant: 'strip-5', speed: 0.39, phase: 4.2 },
  { x: -6.4, y: -0.8, z: -3.6, rx: 0.1, ry: 0.38, rz: -0.09, scale: 0.82, variant: 'vertical-3', speed: 0.45, phase: 5.4 },
  { x: 6.3, y: 0.9, z: -3.5, rx: -0.12, ry: -0.36, rz: 0.1, scale: 0.82, variant: 'vertical-3', speed: 0.43, phase: 6.0 },
];

export const ThreeHeroCanvas: React.FC<ThreeHeroCanvasProps> = ({ palette, isDark }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const syncedMaterialsRef = useRef<
    Array<{ mat: THREE.MeshBasicMaterial; variant: PaletteCardVariant }>
  >([]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 50);
    camera.position.set(0, 0, 8.2);

    const group = new THREE.Group();
    scene.add(group);

    const disposables: Array<{ dispose: () => void }> = [];
    syncedMaterialsRef.current = [];

    // Shared low-poly plane geometries (1 draw call per palette)
    const stripGeo = new THREE.PlaneGeometry(2.1, 0.66);
    const gridGeo = new THREE.PlaneGeometry(1.15, 1.15);
    const vertGeo = new THREE.PlaneGeometry(0.75, 1.5);
    disposables.push(stripGeo, gridGeo, vertGeo);

    const activeHexList =
      palette.length > 0
        ? palette.map((c) => c.hex)
        : CURATED_PALETTES[0];

    interface AnimatedCard {
      mesh: THREE.Mesh;
      cfg: PalettePlacement;
    }
    const cards: AnimatedCard[] = [];

    PALETTE_PLACEMENTS.forEach((cfg, idx) => {
      const colors = cfg.syncActive
        ? activeHexList
        : CURATED_PALETTES[idx % CURATED_PALETTES.length];

      const tex = createPaletteCardTexture(colors, cfg.variant, isDark);
      disposables.push(tex);

      // Depth-based subtle opacity so deeper palettes fade naturally
      const depthFactor = Math.max(0.22, Math.min(1, (cfg.z + 5.8) / 4.8));
      const baseOpacity = isDark ? 0.38 : 0.52;

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: baseOpacity * depthFactor,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      disposables.push(mat);

      if (cfg.syncActive) {
        syncedMaterialsRef.current.push({ mat, variant: cfg.variant });
      }

      const geo =
        cfg.variant === 'grid-2x2'
          ? gridGeo
          : cfg.variant === 'vertical-3'
            ? vertGeo
            : stripGeo;

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cfg.x, cfg.y, cfg.z);
      mesh.rotation.set(cfg.rx, cfg.ry, cfg.rz);
      mesh.scale.setScalar(cfg.scale);
      group.add(mesh);
      cards.push({ mesh, cfg });
    });

    let targetX = 0;
    let targetY = 0;
    const onPointerMove = (e: MouseEvent) => {
      const nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      const ny = -(e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      targetX = nx * 0.22;
      targetY = ny * 0.15;
    };

    window.addEventListener('mousemove', onPointerMove, { passive: true });

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let frameId = 0;
    let lastTime = performance.now();
    let elapsed = 0;

    const animate = (now: number) => {
      frameId = requestAnimationFrame(animate);
      // Clamp delta time so tab switching never causes a jump
      const dt = Math.min((now - lastTime) * 0.001, 0.05);
      lastTime = now;
      elapsed += dt;

      // Frame-rate independent exponential damping for silky pointer parallax
      const damp = 1 - Math.exp(-4.5 * dt);
      group.rotation.y += (targetX - group.rotation.y) * damp;
      group.rotation.x += (-targetY - group.rotation.x) * damp;

      for (let i = 0; i < cards.length; i++) {
        const { mesh, cfg } = cards[i];
        const t = elapsed * cfg.speed + cfg.phase;
        mesh.position.y = cfg.y + Math.sin(t) * 0.22;
        mesh.position.x = cfg.x + Math.cos(t * 0.7) * 0.1;
        mesh.rotation.x = cfg.rx + Math.sin(t * 0.8) * 0.09;
        mesh.rotation.y = cfg.ry + Math.cos(t * 0.6) * 0.11;
        mesh.rotation.z = cfg.rz + Math.sin(t * 0.5) * 0.05;
      }

      renderer.render(scene, camera);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('resize', onResize);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, [isDark]);

  // Update synced palette textures only when the active photo palette changes
  useEffect(() => {
    if (!palette || palette.length === 0) return;
    const hexes = palette.map((c) => c.hex);
    syncedMaterialsRef.current.forEach(({ mat, variant }) => {
      const prevTex = mat.map;
      const nextTex = createPaletteCardTexture(hexes, variant, isDark);
      mat.map = nextTex;
      mat.needsUpdate = true;
      if (prevTex) prevTex.dispose();
    });
  }, [palette, isDark]);

  return (
    <div
      ref={mountRef}
      className="w-full h-full select-none pointer-events-none"
      aria-hidden="true"
    />
  );
};
