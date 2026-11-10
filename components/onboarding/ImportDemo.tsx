import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, CookingPot, Heart, Leaf, Link, MessageCircle, MoreVertical, Send, Slice, Timer, Users } from 'lucide-react';
import { SiInstagram } from 'react-icons/si';
import { ONB_IMG } from './onboardingData';

const TITLES = ['Teilen', 'Cookly wählen', 'Importiert', 'Fertig!'];
const PILLS: Array<[string, number]> = [
  ['600 g Hokkaido', 1], ['2 rote Zwiebeln', 2], ['1 Paprika', 3], ['200 g Feta', 4],
  ['2 EL Olivenöl', 5], ['Thymian', 6], ['Salz & Pfeffer', 7],
];
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const Pill: React.FC<{ c: number; children: React.ReactNode; delay?: number }> = ({ c, children, delay }) => (
  <span className={`pl c${c}`} style={delay === undefined ? undefined : { transitionDelay: `${delay}s` }}>{children}</span>
);

const INTRO_MS = 1500;

/** Animierte Schleife des echten Import-Ablaufs: Reel teilen → Cookly wählen → Import → Rezept. */
export const ImportDemo: React.FC = () => {
  // Kurzer Vorspann, damit klar ist, was die Demo zeigt; nur beim ersten Durchlauf.
  const [intro, setIntro] = useState(!reduced());
  const [phase, setPhase] = useState(reduced() ? 4 : 1);
  const [title, setTitle] = useState(TITLES[reduced() ? 3 : 0]);
  const [titleVisible, setTitleVisible] = useState(true);
  const [linesOn, setLinesOn] = useState(0);
  const [tap, setTap] = useState<{ x: number; y: number; key: number } | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLSpanElement>(null);
  const appRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!intro) return;
    const timer = window.setTimeout(() => setIntro(false), INTRO_MS);
    return () => clearTimeout(timer);
  }, [intro]);

  useEffect(() => {
    if (reduced() || intro) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const set = (p: number) => {
      setPhase(p);
      setTitleVisible(false);
      later(() => { setTitle(TITLES[p - 1]); setTitleVisible(true); }, 200);
    };
    const tapAt = (target: HTMLElement | null) => {
      const box = screenRef.current?.getBoundingClientRect();
      const rect = target?.getBoundingClientRect();
      if (!box || !rect) return;
      setTap({ x: rect.left - box.left + rect.width / 2 - 13, y: rect.top - box.top + rect.height / 2 - 13, key: Date.now() });
    };
    const run = () => {
      set(1);
      setLinesOn(0);
      later(() => tapAt(shareRef.current), 1600);
      later(() => set(2), 2200);
      later(() => tapAt(appRef.current), 3300);
      later(() => set(3), 3900);
      [0, 1, 2].forEach((i) => later(() => setLinesOn(i + 1), 4300 + i * 450));
      later(() => set(4), 5900);
      later(run, 11500);
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, [intro]);

  if (intro) {
    return (
      <div className="onb-dmi">
        <div className="onb-q">So funktionieren Rezeptimporte</div>
        <div className="onb-sub">Teile ein Rezept aus Instagram, TikTok oder dem Web mit Cookly. Wir zeigen dir kurz, wie das geht.</div>
      </div>
    );
  }

  return (
    <>
      <div className="onb-dmh"><div className="onb-q" style={{ opacity: titleVisible ? 1 : 0 }}>
          {title}{title === TITLES[2] && <span className="onb-dots"><i>.</i><i>.</i><i>.</i></span>}
        </div></div>
      <div className="dm" data-p={phase} aria-hidden="true">
        <div className="dm-in" ref={screenRef}>
          <div className="dm-l reel" style={{ backgroundImage: `url(${ONB_IMG.start})` }}>
            <div className="top"><span>Reels</span><Camera size={15} /></div>
            <div className="side">
              <span><Heart size={17} />24,1k</span>
              <span><MessageCircle size={17} />412</span>
              <span ref={shareRef}><Send size={17} />1.208</span>
              <span><MoreVertical size={15} /></span>
              <i style={{ backgroundImage: `url(${ONB_IMG.start})` }} />
            </div>
            <div className="who"><i />kochliebe<em>Folgen</em></div>
            <div className="cap">Kürbis-Gemüse-Pfanne in 20 Minuten 🧡 Zutaten: 600 g Hokkaido, 2 rote Zwiebeln, 1 Paprika, 200 g Feta, Olivenöl, Thymian <span>… mehr</span></div>
            <div className="aud">♫ kochliebe · Originalton</div>
            <div className="nav"><b /><b /><b /><b /><b /></div>
          </div>
          <div className="dm-l sheet">
            <div className="grab" />
            <div className="srch">Suchen</div>
            <div className="ppl">{['Lena', 'Jonas', 'Mama', 'Kochgruppe'].map((n) => <span key={n}><i />{n}</span>)}</div>
            <div className="apps">
              <span><i><Link size={13} /></i>Link kopieren</span>
              <span><i />Story</span>
              <span className="ck" ref={appRef}><i style={{ backgroundImage: `url(${ONB_IMG.icon})` }} /><b>Cookly</b></span>
              <span><i><MoreVertical size={13} /></i>Mehr</span>
            </div>
          </div>
          <div className="dm-l imp">
            <img src={ONB_IMG.icon} alt="" />
            <div className="sp" />
            <div className="tx">Rezept wird importiert …</div>
            <div className="ln">
              {['Zutaten erkannt', 'Zubereitung erkannt', 'Bild übernommen'].map((t, i) => (
                <span key={t} className={linesOn > i ? 'on' : undefined}>{t}</span>
              ))}
            </div>
          </div>
          <div className="dm-l rec">
            <div className="scr">
              <div className="ph" style={{ backgroundImage: `url(${ONB_IMG.start})` }} />
              <div className="bdy">
                <h4>Kürbis-Gemüse-Pfanne</h4>
                <div className="meta">
                  <span><Timer size={9} />25 Min.</span>
                  <span><Users size={9} />4 Portionen</span>
                  <span><SiInstagram size={9} />Instagram</span>
                </div>
                <div className="h">Zutaten</div>
                <div className="pills">
                  {PILLS.map(([t, c], i) => <Pill key={t} c={c} delay={0.35 + i * 0.08}>{t}</Pill>)}
                </div>
                <div className="h">Zubereitung</div>
                <ol>
                  <li style={{ transitionDelay: '.9s' }}><Slice size={10} /><span>Den <Pill c={1}>Hokkaido</Pill> waschen, entkernen und mit Schale in 2 cm große Würfel schneiden.</span></li>
                  <li style={{ transitionDelay: '1.05s' }}><CookingPot size={10} /><span><Pill c={2}>Zwiebeln</Pill> und <Pill c={3}>Paprika</Pill> in Streifen schneiden und im <Pill c={5}>Olivenöl</Pill> 5 Minuten anbraten.</span></li>
                  <li style={{ transitionDelay: '1.2s' }}><Leaf size={10} /><span>Kürbis zugeben, mit <Pill c={6}>Thymian</Pill> würzen und zugedeckt 10 Minuten garen.</span></li>
                  <li style={{ transitionDelay: '1.35s' }}><Check size={10} /><span>Mit zerbröseltem <Pill c={4}>Feta</Pill> bestreuen und sofort servieren.</span></li>
                </ol>
              </div>
            </div>
          </div>
          {tap && <div key={tap.key} className="tap go" style={{ left: tap.x, top: tap.y }} />}
        </div>
      </div>
    </>
  );
};
