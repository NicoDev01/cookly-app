import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pointer } from 'lucide-react';
import ImportingRecipe from '../../import/ImportingRecipe';
import { IMPORT_CSS } from '../../import/importStyles';
import { ONB_IMG } from '../../onboarding/onboardingData';
import { DEMO_RECIPE as importedRecipe } from './demoData';
import { POST, SCREEN, StatusBar, type DemoOs, type DemoPlatform } from './kit';
import { ChromeMenu, FacebookFeed, FacebookSheet, InstagramFeed, InstagramSheet, TikTokFeed, TikTokSheet, WebFeed } from './platforms';
import { SystemShareSheet } from './systemSheets';

/**
 * Animierte Anleitung „Rezept aus einer App teilen“: ein virtuelles Handy (390×844) mit Zeitplan.
 * Eine Kamera zoomt auf jedes Tipp-Ziel ([data-target] im Bildschirm), danach öffnet Cookly mit dem echten
 * Import-Skelett (components/import/ImportingRecipe) und lädt das Rezept hinein. Läuft in Schleife.
 */
type Layer = 'feed' | 'app' | 'system' | 'cookly';
/** `zoom`: Kamera-Ziel; `aim`: Finger und Ring zeigen auf das Ziel; `tap`: Finger drückt. */
type Beat = { at: number; layer?: Layer; caption?: string; zoom?: string | null; aim?: string | null; tap?: string };

/** Leicht ranzoomen und zwischen den Zielen schwenken; ganz raus erst, wenn Cookly öffnet. */
const ZOOM = 1.45;
const TICK = 80;
/** Zeigen bis Tippen, Tippen bis nächste Fläche, Blatt fährt hoch bis zum Schwenk. */
const AIM = 1900;
const PRESS = 700;
const OPEN = 650;
/** Cookly: Skelett pulsiert, dann Bild, dann Rezept mit gestaffelten Zutaten und Schritten. */
const CK = { image: 2000, recipe: 3200, done: 4400, end: 7800 };

type Script = { beats: Beat[]; cooklyAt: number; end: number };

const buildScript = (platform: DemoPlatform, os: DemoOs): Script => {
  const firstTap = platform === 'web' ? (os === 'ios' ? 'Tipp auf Teilen' : 'Tipp auf ⋮') : platform === 'facebook' ? 'Tipp auf „Teilen“' : 'Tipp auf Teilen';
  const second: Record<DemoPlatform, string | null> = {
    instagram: 'Tipp auf „Teilen“',
    tiktok: 'Tipp auf „Mehr“',
    facebook: 'Tipp auf „Mehr Optionen“',
    web: os === 'ios' ? null : 'Tipp auf „Teilen …“',
  };
  const beats: Beat[] = [{ at: 0, layer: 'feed', caption: platform === 'web' ? 'Rezept im Browser gefunden' : 'Rezept gefunden', zoom: null, aim: null }];
  let t = 1600;
  const press = (id: string, caption: string) => {
    beats.push({ at: t, zoom: id, aim: id, caption }, { at: t + AIM, tap: id });
    t += AIM + PRESS;
  };
  press('share', firstTap);
  if (second[platform]) {
    beats.push({ at: t, layer: 'app' });
    t += OPEN;
    press('more', second[platform]!);
  }
  beats.push({ at: t, layer: 'system' });
  t += OPEN;
  press('cookly', 'Wähle Cookly');
  beats.push({ at: t, layer: 'cookly', zoom: null, aim: null, caption: 'Cookly holt das Rezept' }, { at: t + CK.done, caption: 'Gespeichert!' });
  return { beats, cooklyAt: t, end: t + CK.end };
};

/** Zustand zum Zeitpunkt t: jeweils der letzte Wert jeder Spur. */
const stateAt = (beats: Beat[], t: number) => {
  const s = { layer: 'feed' as Layer, caption: '', zoom: null as string | null, aim: null as string | null, tap: null as string | null };
  for (const b of beats) {
    if (b.at > t) break;
    if (b.layer) s.layer = b.layer;
    if (b.caption) s.caption = b.caption;
    if (b.zoom !== undefined) s.zoom = b.zoom;
    if (b.aim !== undefined) s.aim = b.aim;
    if (b.tap && t - b.at < PRESS) s.tap = b.tap;
  }
  return s;
};

/** Mitte und Größe im unverschobenen Bildschirm; offsetTop ignoriert transform, also zählt die Endlage geöffneter Blätter. */
const rectIn = (el: HTMLElement, root: HTMLElement) => {
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
};

/** Finger startet unten außerhalb des Bildes und gleitet zum ersten Ziel. */
const FINGER_HOME = { x: SCREEN.w * 0.62, y: SCREEN.h + 60 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** `freezeAt` (ms): Labor-Standbild für Prüfung und Abstimmung, ohne Ablauf. */
export const ShareDemo: React.FC<{ platform: DemoPlatform; os: DemoOs; width: number; freezeAt?: number; onCaption?: (c: string) => void }> = ({ platform, os, width, freezeAt, onCaption }) => {
  const script = useMemo(() => buildScript(platform, os), [platform, os]);
  const [run, setRun] = useState(0);
  const [t, setT] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });
  const [ring, setRing] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    if (freezeAt !== undefined) return setT(freezeAt);
    setT(0);
    const start = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now() - start;
      if (now > script.end) {
        setRun((r) => r + 1);
        return;
      }
      setT(now);
    }, TICK);
    return () => window.clearInterval(id);
  }, [script, run, freezeAt]);

  const s = stateAt(script.beats, t);
  useEffect(() => onCaption?.(s.caption), [s.caption, onCaption]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const el = s.zoom ? root?.querySelector<HTMLElement>(`[data-target="${s.zoom}"]`) : null;
    if (!root || !el) return setCamera({ x: 0, y: 0, z: 1 });
    const c = rectIn(el, root);
    const z = ZOOM;
    setCamera({
      x: clamp(SCREEN.w / 2 - c.x * z, SCREEN.w - SCREEN.w * z, 0),
      y: clamp(SCREEN.h * 0.5 - c.y * z, SCREEN.h - SCREEN.h * z, 0),
      z,
    });
  }, [s.zoom]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const el = s.aim ? root?.querySelector<HTMLElement>(`[data-target="${s.aim}"]`) : null;
    setRing(root && el ? rectIn(el, root) : null);
  }, [s.aim]);
  // Fingerspitze leicht rechts unterhalb der Mitte, damit das Ziel sichtbar bleibt.
  const finger = ring ? { x: ring.x + ring.w * 0.22, y: ring.y + ring.h * 0.25 } : FINGER_HOME;

  const scale = width / SCREEN.w;
  const Feed = { instagram: InstagramFeed, tiktok: TikTokFeed, facebook: FacebookFeed, web: WebFeed }[platform];
  const AppSheet = { instagram: InstagramSheet, tiktok: TikTokSheet, facebook: FacebookSheet, web: ChromeMenu }[platform];
  const dimmed = s.layer === 'app' || s.layer === 'system';

  return (
    <div
      className={`relative mx-auto overflow-hidden bg-black ${freezeAt !== undefined ? 'sd-frozen' : ''}`}
      style={{ width: width + 12, height: SCREEN.h * scale + 12, borderRadius: 30 * (width / 220) + 6, padding: 6, boxShadow: '0 22px 40px -22px rgba(20,40,28,.6)' }}
      aria-hidden
    >
      <style>{IMPORT_CSS + DEMO_CSS}</style>
      <div className="relative overflow-hidden" style={{ width, height: SCREEN.h * scale, borderRadius: 30 * (width / 220) }}>
        <div style={{ width: SCREEN.w, height: SCREEN.h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          <div
            ref={rootRef}
            className="relative overflow-hidden"
            style={{
              width: SCREEN.w,
              height: SCREEN.h,
              transformOrigin: '0 0',
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`,
              transition: 'transform 1.1s cubic-bezier(.4,0,.2,1)',
            }}
          >
            <Feed os={os} />
            <div className={`absolute inset-0 z-10 bg-black/40 transition-opacity duration-300 ${dimmed && platform !== 'web' ? 'opacity-100' : 'opacity-0'}`} />
            <AppSheet os={os} open={s.layer === 'app'} />
            <div className={`absolute inset-0 z-20 bg-black/30 transition-opacity duration-300 ${s.layer === 'system' ? 'opacity-100' : 'opacity-0'}`} />
            <SystemShareSheet os={os} open={s.layer === 'system'} platform={platform} />
            {s.layer === 'cookly' && <CooklyScene key={run} os={os} t={t - script.cooklyAt} provider={platform === 'web' ? 'website' : 'social'} />}
            {ring && (
              <span
                key={`${s.aim}-${run}`}
                className={`sd-ring ${s.tap ? 'sd-ring-press' : ''}`}
                style={{ left: ring.x - ring.w / 2 - 8, top: ring.y - ring.h / 2 - 8, width: ring.w + 16, height: ring.h + 16, borderRadius: Math.min(ring.w, ring.h) / 2 + 8 }}
              />
            )}
            <span className={`sd-finger ${ring ? 'opacity-100' : 'opacity-0'}`} style={{ left: finger.x, top: finger.y }}>
              <span key={s.tap ? `${s.tap}-${run}` : 'idle'} className={`block ${s.tap ? 'sd-press' : ''}`}>
                <Pointer size={56} fill="#fff" color={INK} strokeWidth={1.4} />
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const CooklyScene: React.FC<{ os: DemoOs; t: number; provider: 'website' | 'social' }> = ({ os, t, provider }) => {
  const recipe = t >= CK.recipe ? importedRecipe : null;
  const ingredientCount = recipe ? Math.min(recipe.ingredients.length, Math.floor((t - CK.recipe) / 150) + 1) : 0;
  const stepCount = recipe ? Math.min(recipe.instructions.length, Math.floor((t - CK.recipe - 500) / 380) + 1) : 0;
  const done = t >= CK.done;
  const title = done ? 'Rezept ist fertig!' : t < 500 ? 'Link erkannt' : t < CK.image ? (provider === 'website' ? 'Webseite wird gelesen' : 'Beitrag wird geladen') : t < CK.recipe ? 'Rezept wird erkannt' : 'Wird gespeichert';
  const percent = Math.min(100, (t / CK.done) * 100);

  return (
    <div className="sd-app absolute inset-0 z-40 flex flex-col overflow-hidden bg-white font-display" style={{ ["--sd-top" as string]: os === 'ios' ? '54px' : '40px' }}>
      <div className="absolute inset-x-0 top-0 z-30"><StatusBar os={os} dark={!!(t >= CK.image)} /></div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ImportingRecipe image={t >= CK.image ? POST.image : null} recipe={recipe} ingredientCount={ingredientCount} stepCount={stepCount} onBack={() => undefined} />
      </div>
      <div className="absolute inset-x-3 bottom-6 z-40 rounded-[24px] border border-black/[0.05] bg-white px-4 py-3.5 shadow-[0_20px_44px_-18px_rgba(20,40,30,0.45),0_2px_6px_rgba(20,40,30,0.06)]">
        <div className="flex items-center gap-3">
          <img src={done ? ONB_IMG.nice : ONB_IMG.setup} alt="" className={`size-14 object-contain ${done ? '' : 'imp-bob'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-extrabold leading-tight tracking-tight text-[#111718]">{title}</p>
            <p className="mt-0.5 text-[13px] font-medium text-gray-500">{done ? `In „${importedRecipe.category}“ gespeichert` : 'Du kannst die App solange verlassen.'}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-card-light">
            <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(4, percent)}%` }} />
          </div>
          <span className="w-[52px] text-right text-[20px] font-black tabular-nums text-[#111718]">
            {done ? <span className="material-symbols-outlined filled !text-[28px] leading-none text-primary">check_circle</span> : <>{Math.floor(percent)}<span className="text-[13px] text-gray-400">%</span></>}
          </span>
        </div>
      </div>
    </div>
  );
};

const INK = '#15241b';

/**
 * Ring um das Ziel (erscheint, wenn die Kamera angekommen ist, pulsiert leicht), Finger gleitet mit,
 * beim Tippen drückt der Finger, der Ring füllt sich und eine Welle läuft aus.
 * .sd-app hält die Import-Seite in der Höhe des virtuellen Handys statt 100dvh.
 */
const DEMO_CSS = `
  .sd-app { animation: sdOpen .5s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes sdOpen { from { opacity:0; transform:scale(.94); } to { opacity:1; transform:none; } }
  .sd-frozen *, .sd-frozen *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }
  .sd-app [style*="safe-area-inset-top"] { padding-top: var(--sd-top) !important; }
  .sd-app main { min-height: ${SCREEN.h}px !important; }
  .sd-ring { position:absolute; z-index:59; pointer-events:none; border:3px solid #2f5d46;
    box-shadow:0 0 0 3px rgba(255,255,255,.92), 0 8px 22px rgba(20,40,28,.35);
    animation: sdRingIn .4s .75s cubic-bezier(.2,.9,.3,1.3) both, sdPulse 1.3s 1.15s ease-in-out infinite; }
  @keyframes sdRingIn { from { opacity:0; transform:scale(1.35); } to { opacity:1; transform:none; } }
  @keyframes sdPulse { 50% { transform:scale(1.07); } }
  .sd-ring-press { animation: sdRingPress .7s ease-out both; }
  .sd-ring-press::after { content:''; position:absolute; inset:-3px; border-radius:inherit; border:3px solid #2f5d46; animation: sdWave .7s ease-out both; }
  @keyframes sdRingPress { 0% { background:rgba(47,93,70,0); } 30% { background:rgba(47,93,70,.35); transform:scale(.92); } 100% { background:rgba(47,93,70,.12); transform:none; } }
  @keyframes sdWave { from { opacity:.9; transform:scale(1); } to { opacity:0; transform:scale(1.8); } }
  .sd-finger { position:absolute; z-index:61; pointer-events:none; margin:-5px 0 0 -19px;
    filter: drop-shadow(0 5px 8px rgba(0,0,0,.35));
    transition: left 1.1s cubic-bezier(.4,0,.2,1), top 1.1s cubic-bezier(.4,0,.2,1), opacity .4s; }
  .sd-finger > span { transform-origin: 19px 5px; }
  .sd-press { animation: sdPress .7s ease-out both; }
  @keyframes sdPress { 0% { transform:none; } 25% { transform:scale(.82) translateY(3px); } 55% { transform:scale(.82) translateY(3px); } 100% { transform:none; } }
`;
