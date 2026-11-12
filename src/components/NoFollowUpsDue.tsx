"use client";

import "animate.css";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

const hasWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

/**
 * Small stylised car. Three.js is imported only when this empty state appears.
 * Static first frame; it re-renders only while dragged (or arrow keys) and on resize. No animation loop.
 */
function Vehicle() {
  const mount = useRef<HTMLDivElement>(null);
  const [webgl] = useState(hasWebGL);

  useEffect(() => {
    if (!webgl) return;
    let cleanup = () => {};
    let cancelled = false;
    import("three").then((THREE) => {
      const el = mount.current;
      if (cancelled || !el) return;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.1, 50);
      camera.position.set(0, 1.6, 6);
      camera.lookAt(0, 0.3, 0);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      el.appendChild(renderer.domElement);

      const car = new THREE.Group();
      const disposables: { dispose: () => void }[] = [];
      const box = (w: number, h: number, d: number, color: number, y: number, x = 0) => {
        const g = new THREE.BoxGeometry(w, h, d);
        const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        disposables.push(g, m);
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(x, y, 0);
        car.add(mesh);
      };
      box(2.4, 0.5, 1.1, 0x0f6173, 0.45); // body
      box(1.3, 0.45, 1.0, 0xeaf4f6, 0.92, -0.15); // cabin
      const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 20);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x17212b, roughness: 0.9 });
      disposables.push(wheelGeo, wheelMat);
      for (const [x, z] of [[-0.75, 0.55], [0.75, 0.55], [-0.75, -0.55], [0.75, -0.55]]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.2, z);
        car.add(w);
      }
      car.rotation.y = -0.6;
      scene.add(car);
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      sun.position.set(3, 5, 4);
      scene.add(sun);

      const render = () => renderer.render(scene, camera);
      render();

      let dragX: number | null = null;
      const down = (e: PointerEvent) => {
        dragX = e.clientX;
        renderer.domElement.setPointerCapture(e.pointerId);
      };
      const move = (e: PointerEvent) => {
        if (dragX === null) return;
        car.rotation.y += (e.clientX - dragX) * 0.012;
        dragX = e.clientX;
        render();
      };
      const up = () => (dragX = null);
      const key = (e: KeyboardEvent) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        car.rotation.y += e.key === "ArrowLeft" ? -0.25 : 0.25;
        render();
      };
      const canvas = renderer.domElement;
      canvas.style.touchAction = "none"; // dragging rotates instead of scrolling
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", up);
      el.addEventListener("keydown", key);
      const ro = new ResizeObserver(() => {
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight);
        render();
      });
      ro.observe(el);

      cleanup = () => {
        ro.disconnect();
        el.removeEventListener("keydown", key);
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        canvas.remove();
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [webgl]);

  if (!webgl) {
    return (
      <svg role="img" aria-label="Car illustration" viewBox="0 0 120 50" className="mx-auto h-40 w-auto text-accent">
        <path d="M10 34h100v-8l-16-4-12-10H44L30 22l-20 4z" fill="currentColor" opacity="0.9" />
        <circle cx="34" cy="36" r="7" fill="#17212b" />
        <circle cx="88" cy="36" r="7" fill="#17212b" />
      </svg>
    );
  }
  return (
    <div
      ref={mount}
      tabIndex={0}
      role="img"
      aria-label="Car illustration. Drag, or use the left and right arrow keys, to turn it."
      className="mx-auto h-40 w-full max-w-xs cursor-grab rounded-xl focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing"
    />
  );
}

/** The "No follow-ups currently due" empty state (.design/patterns/shell-and-states.md). */
export function NoFollowUpsDue({ onViewAll }: { onViewAll: () => void }) {
  return (
    <div className="px-6 py-10 text-center">
      <Vehicle />
      {/* Animate.css target is the text only, kept apart from GSAP-animated elements. */}
      <div className="animate__animated animate__fadeIn animate__faster mt-4">
        <h2 className="text-lg font-semibold text-text">No follow-ups currently due</h2>
        <p className="mx-auto mt-1 max-w-[44ch] text-sm text-muted">Nothing is overdue or due today. New reminders appear here on the day they&apos;re due.</p>
        <Button className="mt-4" variant="secondary" onClick={onViewAll}>View all quotes</Button>
      </div>
    </div>
  );
}
