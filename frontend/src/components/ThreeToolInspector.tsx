import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface ThreeToolInspectorProps {
  mode: 'print';
  sourceCanvas: HTMLCanvasElement | null;
  renderVersion: number;
  palette: Array<{ hex: string }>;
  pixelCloud: Array<{ r: number; g: number; b: number; hex: string }>;
  isDark: boolean;
}

export function ThreeToolInspector({ sourceCanvas, renderVersion, isDark }: ThreeToolInspectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const rotateRef = useRef(autoRotate);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  rotateRef.current = autoRotate;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sourceCanvas) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); }
    catch { setWebglUnavailable(true); return; }
    setWebglUnavailable(false);
    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 5.4);
    scene.add(new THREE.AmbientLight(0xffffff, isDark ? 1.25 : 1.55));
    const key = new THREE.DirectionalLight(0xfff9ee, 1.9); key.position.set(4, 6, 6); scene.add(key);
    const fill = new THREE.DirectionalLight(0x88a4c0, 0.85); fill.position.set(-5, -3, 3); scene.add(fill);
    const pivot = new THREE.Group(); scene.add(pivot);
    const aspect = sourceCanvas.width / Math.max(1, sourceCanvas.height);
    let planeWidth = 3.1; let planeHeight = planeWidth / aspect;
    if (planeHeight > 3.1) { planeHeight = 3.1; planeWidth = planeHeight * aspect; }
    const texture = new THREE.CanvasTexture(sourceCanvas); texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.BoxGeometry(planeWidth, planeHeight, 0.09);
    const side = new THREE.MeshStandardMaterial({ color: isDark ? 0x262f3a : 0xebe5d8, roughness: 0.7 });
    const front = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.32, metalness: 0.04 });
    const back = new THREE.MeshStandardMaterial({ color: isDark ? 0x181e24 : 0xdfd8c8, roughness: 0.8 });
    const mesh = new THREE.Mesh(geometry, [side, side, side, side, front, back]); pivot.add(mesh);
    const frameGeometry = new THREE.BoxGeometry(planeWidth + 0.14, planeHeight + 0.14, 0.04);
    const edges = new THREE.EdgesGeometry(frameGeometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: isDark ? 0x495666 : 0xbdb4a3, transparent: true, opacity: 0.55 });
    const frame = new THREE.LineSegments(edges, lineMaterial); frame.position.z = -0.05; pivot.add(frame);

    let dragging = false; let lastX = 0; let lastY = 0;
    const down = (event: PointerEvent) => { dragging = true; lastX = event.clientX; lastY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); };
    const move = (event: PointerEvent) => { if (!dragging) return; pivot.rotation.y += (event.clientX - lastX) * 0.0085; pivot.rotation.x = Math.max(-1.2, Math.min(1.2, pivot.rotation.x + (event.clientY - lastY) * 0.0085)); lastX = event.clientX; lastY = event.clientY; };
    const up = () => { dragging = false; };
    renderer.domElement.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('blur', up);
    const resize = () => { const w = container.clientWidth || 640; const h = container.clientHeight || 480; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
    window.addEventListener('resize', resize);
    let frameId = 0; const clock = new THREE.Clock();
    const animate = () => { frameId = requestAnimationFrame(animate); if (!dragging && rotateRef.current) pivot.rotation.y = Math.sin(clock.getElapsedTime() * 0.7) * 0.28; renderer.render(scene, camera); };
    animate();
    return () => {
      cancelAnimationFrame(frameId); renderer.domElement.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', up); window.removeEventListener('resize', resize);
      texture.dispose(); geometry.dispose(); side.dispose(); front.dispose(); back.dispose(); frameGeometry.dispose(); edges.dispose(); lineMaterial.dispose(); renderer.dispose();
    };
  }, [sourceCanvas, renderVersion, isDark]);

  if (!sourceCanvas) return <div className="flex min-h-[420px] items-center justify-center text-[var(--fg-secondary)]">Generate an image before opening print view.</div>;
  if (webglUnavailable) return <div className="flex min-h-[420px] items-center justify-center text-[var(--fg-secondary)]">3D preview is unavailable in this browser. Your generated image is still available to download.</div>;
  return <div className="relative flex h-full min-h-[420px] w-full items-center justify-center"><div ref={containerRef} className="h-full min-h-[420px] w-full cursor-grab active:cursor-grabbing"/><div className="absolute bottom-4 right-4 flex items-center gap-2"><span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/85 px-3 py-1 text-xs text-[var(--fg-secondary)]">Drag to rotate</span><button type="button" onClick={() => setAutoRotate((value) => !value)} className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/85 px-3 py-1 text-xs">{autoRotate ? 'Pause' : 'Orbit'}</button></div></div>;
}
