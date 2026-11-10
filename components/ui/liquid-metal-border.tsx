import React, { useEffect, useRef } from 'react';
import {
  defaultPatternSizing,
  emptyPixel,
  LiquidMetalShapes,
  liquidMetalFragmentShader,
  ShaderFitOptions,
  ShaderMount,
} from '@paper-design/shaders';
import { cn } from '../../lib/utils';

/**
 * Animierter Flüssigmetall-Rand um einen Button (Idee: 21st.dev „Liquid Metal Button“).
 * Nur der Rand: Der Shader füllt die Fläche, das Kind deckt alles bis auf `width` Pixel ab.
 * Der Shader pausiert selbst, wenn er nicht sichtbar ist (Tab versteckt, außerhalb des Viewports).
 */
export function LiquidMetalBorder({
  children,
  className,
  width = 3,
  shift = 0.3,
  sheen,
}: {
  children: React.ReactNode;
  className?: string;
  width?: number;
  /** Farbsaum an den Kanten (Rot/Blau-Verschiebung); höher = mehr Schimmer. */
  shift?: number;
  /** CSS-Hintergrund, der per "screen" über dem Metall liegt: hellt die dunklen Streifen farbig auf (z. B. Pastell). */
  sheen?: string;
}) {
  const shaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = shaderRef.current;
    if (!host) return;
    let mount: ShaderMount | null = null;
    let cancelled = false;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Ohne Bild braucht der Sampler trotzdem eine Textur, sonst warnt WebGL bei jedem Frame.
    const image = new Image();
    image.src = emptyPixel;
    image.decode().catch(() => undefined).then(() => {
      if (cancelled) return;
      try {
        mount = new ShaderMount(
          host,
          liquidMetalFragmentShader,
          {
            u_image: image,
            u_isImage: false,
            u_shape: LiquidMetalShapes.none,
            u_colorBack: [0, 0, 0, 0],
            u_colorTint: [1, 1, 1, 1],
            u_repetition: 4,
            u_softness: 0.5,
            u_shiftRed: shift,
            u_shiftBlue: shift,
            u_distortion: 0,
            u_contour: 0,
            u_angle: 45,
            u_fit: ShaderFitOptions[defaultPatternSizing.fit],
            u_scale: defaultPatternSizing.scale,
            u_rotation: defaultPatternSizing.rotation,
            u_originX: defaultPatternSizing.originX,
            u_originY: defaultPatternSizing.originY,
            u_offsetX: defaultPatternSizing.offsetX,
            u_offsetY: defaultPatternSizing.offsetY,
            u_worldWidth: defaultPatternSizing.worldWidth,
            u_worldHeight: defaultPatternSizing.worldHeight,
          },
          { premultipliedAlpha: false, alpha: true },
          reduceMotion ? 0 : 0.6,
        );
      } catch {
        // Kein WebGL: Der Button bleibt ohne Rand nutzbar.
      }
    });

    return () => {
      cancelled = true;
      mount?.dispose();
    };
  }, [shift]);

  return (
    <div className={cn('relative isolate rounded-full', className)} style={{ padding: width }}>
      <div
        ref={shaderRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-full bg-gray-300 [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:!h-full [&>canvas]:!w-full"
      />
      {sheen && <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-full mix-blend-screen" style={{ background: sheen }} />}
      {children}
    </div>
  );
}
