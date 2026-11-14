import React, { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { Camera, ChevronRight, ClipboardPaste, Globe, Link2, PenLine, X, type LucideIcon } from 'lucide-react';
import { SiFacebook, SiInstagram, SiTiktok } from 'react-icons/si';
import { useModal } from '../../contexts/ModalContext';
import { useNotification } from '../../contexts/NotificationContext';
import { detectImportTarget, type ImportProvider } from '../../utils/importTarget';
import { registerBackButtonOverride } from '../../services/backButtonOverride';
import { capture } from '../../services/analytics';
import { logger } from '../../utils/logger';
import { ShareDemo } from './shareDemo/ShareDemo';
import { SCREEN, type DemoOs, type DemoPlatform } from './shareDemo/kit';
import PhotoStep from './PhotoStep';
import { Badge, C, Header, IG, Row } from './ui';
import { animateHeightFrom, useAnimatedClose, useDragToDismiss } from './motion';
import { useHaptic } from '../../hooks/useHaptic';

const AddRecipeModal = React.lazy(() => import('../AddRecipeModal'));

/**
 * Plus-Button: Bottom-Sheet, das nach der Quelle fragt (Neuentwurf 13.11.2026, vorher Modal mit Tabs).
 * Apps → animierte Teilen-Anleitung; Link einfügen → echter Import (pages/ShareTargetPage.tsx);
 * Foto scannen → PhotoStep; Selbst schreiben → AddRecipeModal (Formular, auch zum Bearbeiten genutzt).
 */
type Step = 'start' | 'apps' | 'link' | 'photo' | 'manual';

const PROVIDERS: Record<ImportProvider, { label: string; bg: string; icon: React.ReactNode }> = {
  instagram: { label: 'Instagram-Beitrag', bg: IG, icon: <SiInstagram size={14} /> },
  tiktok: { label: 'TikTok-Video', bg: '#000', icon: <SiTiktok size={14} /> },
  facebook: { label: 'Facebook-Beitrag', bg: '#0866FF', icon: <SiFacebook size={14} /> },
  website: { label: 'Webseite', bg: C.cta, icon: <Globe size={14} strokeWidth={2.2} /> },
};

const DEMO_TABS: { id: DemoPlatform; label: string; bg: string; icon: React.ReactNode; app?: string; url?: string }[] = [
  { id: 'instagram', label: 'Instagram', bg: IG, icon: <SiInstagram size={13} />, app: 'Instagram', url: 'https://www.instagram.com/' },
  { id: 'tiktok', label: 'TikTok', bg: '#000', icon: <SiTiktok size={13} />, app: 'TikTok', url: 'https://www.tiktok.com/' },
  { id: 'facebook', label: 'Facebook', bg: '#0866FF', icon: <SiFacebook size={13} />, app: 'Facebook', url: 'https://www.facebook.com/' },
  { id: 'web', label: 'Web', bg: C.cta, icon: <Globe size={13} strokeWidth={2.4} /> },
];

const initialStep = (tab: 'ai' | 'manual' | null, importUrl: string | null): Step =>
  importUrl || tab === 'manual' ? 'manual' : tab === 'ai' ? 'photo' : 'start';

const AddRecipeSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addModalInitialTab, addModalImportUrl } = useModal();
  const navigate = useNavigate();
  const haptic = useHaptic();
  const [entry] = useState(() => initialStep(addModalInitialTab, addModalImportUrl));
  const [step, setStep] = useState<Step>(entry);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [closing, close] = useAnimatedClose(onClose);
  const os: DemoOs = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';

  useEffect(() => {
    capture('first_action_started', { entryPoint: 'add_recipe' });
    void haptic.impact('light');
    // Nur beim Öffnen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Schrittwechsel: Sheet-Höhe gleitet von der alten auf die neue Höhe (FLIP), Inhalt kommt aus der Laufrichtung.
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const fromHeightRef = useRef<number | null>(null);
  const go = useCallback((next: Step, direction: 'fwd' | 'back' = 'fwd') => {
    fromHeightRef.current = sheetRef.current?.offsetHeight ?? null;
    setDir(direction);
    setStep(next);
  }, []);
  useLayoutEffect(() => {
    animateHeightFrom(sheetRef.current, fromHeightRef.current);
    fromHeightRef.current = null;
  }, [step]);

  // Nach unten wischen schließt (wie iOS-Sheets); während des Schließens nicht mehr greifbar.
  useDragToDismiss(sheetRef, scrimRef, onClose, !closing && step !== 'manual');

  // Aus einem Unterschritt führt Zurück (auch die Android-Taste) erst zur Auswahl, nicht aus dem Sheet.
  const back = useCallback(() => go('start', 'back'), [go]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || step === 'start' || step === 'manual') return;
    return registerBackButtonOverride(back);
  }, [step, back]);

  if (step === 'manual') {
    return (
      <Suspense fallback={null}>
        {/* Abbrechen führt zurück zur Auswahl, Speichern schließt alles. Direkt geöffnet (z. B. aus „So funktioniert's“) schließt beides. */}
        <AddRecipeModal isOpen onClose={onClose} onCancel={entry === 'manual' ? onClose : back} />
      </Suspense>
    );
  }

  return createPortal(
    <div className="kb-pad fixed inset-0 z-[60] flex items-end justify-center font-display" role="dialog" aria-modal="true" aria-label="Rezept hinzufügen">
      <button ref={scrimRef} type="button" aria-label="Schließen" className={`absolute inset-0 bg-black/40 ${closing ? 'scrim-out' : 'scrim-in'}`} onClick={close} />
      {/* Hinter der iOS-Tastatur Sheet-Farbe, damit an ihren runden Ecken nichts Dunkles durchscheint. */}
      {!closing && <div className="kb-under" style={{ background: C.bg }} />}
      <div
        ref={sheetRef}
        className={`sheet-pad relative flex max-h-[92%] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] shadow-2xl will-change-transform ${closing ? 'sheet-out' : 'sheet-in'}`}
        style={{ background: C.bg, color: C.ink }}
      >
        {/* Griff: größere Tippfläche, damit das Wischen auch ganz oben sicher greift. */}
        <div className="flex h-5 flex-none items-end justify-center" aria-hidden>
          <div className="h-1 w-10 rounded-full" style={{ background: C.line }} />
        </div>
        <div key={step} className={`flex min-h-0 flex-col ${step === entry && dir === 'fwd' ? '' : dir === 'fwd' ? 'step-in' : 'step-in-back'}`}>
          {step === 'start' && <Start onClose={close} setStep={go} />}
          {step === 'apps' && <Apps os={os} onBack={back} onLink={() => go('link')} />}
          {step === 'link' && <LinkStep onBack={back} onImport={(url) => { onClose(); navigate(`/share-target?${new URLSearchParams({ url, source: 'paste' })}`); }} />}
          {step === 'photo' && <PhotoStep onBack={back} onStarted={close} />}
        </div>
      </div>
    </div>,
    document.body,
  );
};

const Start: React.FC<{ onClose: () => void; setStep: (s: Step) => void }> = ({ onClose, setStep }) => (
  <div className="overflow-y-auto overscroll-contain px-5">
    <Header title="Rezept hinzufügen" onClose={onClose} />

    <button
      type="button"
      onClick={() => setStep('apps')}
      className="block w-full rounded-3xl px-4 pb-3.5 pt-3 text-left text-white transition-transform active:scale-[0.98]"
      style={{ background: C.cta, boxShadow: '0 14px 28px -18px rgba(20,40,28,.7)' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex -space-x-2">
          <Badge bg={IG} ring={C.cta} size={30}><SiInstagram size={15} /></Badge>
          <Badge bg="#000" ring={C.cta} size={30}><SiTiktok size={15} /></Badge>
          <Badge bg="#0866FF" ring={C.cta} size={30}><SiFacebook size={15} /></Badge>
          <Badge bg="#fff" ring={C.cta} size={30}><Globe size={16} color={C.cta} strokeWidth={2.2} /></Badge>
        </div>
        <span className="flex flex-none items-center gap-0.5 rounded-full bg-white/15 py-1 pl-3 pr-2 text-[13px] font-bold">
          So geht’s <ChevronRight size={16} />
        </span>
      </div>
      <div className="text-[17px] font-bold leading-tight">Aus Instagram, TikTok, Facebook & Web</div>
    </button>

    <Row icon={Link2} tint={C.cta} tintBg={C.soft} title="Link einfügen" onClick={() => setStep('link')} />

    <div className="mt-3 grid grid-cols-2 gap-3">
      <Tile icon={Camera} tint={C.orange} tintBg="#fbe7d6" title="Foto scannen" sub="Kochbuch, Zettel oder Screenshot" onClick={() => setStep('photo')} />
      <Tile icon={PenLine} tint={C.brown} tintBg="#efe6dc" title="Selbst schreiben" sub="Zutaten und Schritte eintippen" onClick={() => setStep('manual')} />
    </div>
  </div>
);

const Tile: React.FC<{ icon: LucideIcon; tint: string; tintBg: string; title: string; sub: string; onClick: () => void }> = ({ icon: Icon, tint, tintBg, title, sub, onClick }) => (
  <button type="button" onClick={onClick} className="flex flex-col items-start gap-2.5 rounded-2xl bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,.05)] transition-transform active:scale-[0.98]">
    <span className="flex size-11 items-center justify-center rounded-full" style={{ background: tintBg, color: tint }}>
      <Icon size={21} strokeWidth={2.2} />
    </span>
    <span>
      <span className="block text-[15px] font-bold">{title}</span>
      <span className="block text-[12.5px] leading-snug" style={{ color: C.muted }}>{sub}</span>
    </span>
  </button>
);

/** Öffnet die App über ihren Web-Link: Android/iOS reichen ihn an die installierte App weiter, sonst Browser. */
const openApp = async (url: string) => {
  try {
    if (Capacitor.isNativePlatform()) await AppLauncher.openUrl({ url });
    else window.open(url, '_blank', 'noopener');
  } catch (error) {
    logger.warn('AddRecipe', 'Could not open app', error);
  }
};

const Apps: React.FC<{ os: DemoOs; onBack: () => void; onLink: () => void }> = ({ os, onBack, onLink }) => {
  const haptic = useHaptic();
  const [platform, setPlatform] = useState<DemoPlatform>('instagram');
  const [caption, setCaption] = useState('');
  const tab = DEMO_TABS.find((d) => d.id === platform)!;
  // Handy so groß, wie die Höhe zwischen Überschrift und Buttons erlaubt (Rahmen 12 px).
  const boxRef = useRef<HTMLDivElement>(null);
  const [phoneWidth, setPhoneWidth] = useState(0);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => setPhoneWidth(Math.floor(Math.min(240, ((box.clientHeight - 12) * SCREEN.w) / SCREEN.h)));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="flex h-[calc(92dvh-20px)] min-h-0 flex-col">
      <div className="px-5"><Header title="Aus Apps speichern" onBack={onBack} /></div>
      <div className="flex flex-none gap-2 overflow-x-auto px-5 pb-3 scrollbar-hide">
        {DEMO_TABS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              if (d.id !== platform) void haptic.selection();
              setPlatform(d.id);
            }}
            aria-label={d.label}
            aria-pressed={d.id === platform}
            className={`flex flex-none items-center gap-1.5 rounded-full py-1.5 pl-1.5 text-[14px] font-bold transition-colors ${d.id === platform ? 'pr-3.5' : 'pr-1.5'}`}
            style={{ background: d.id === platform ? C.ink : '#fff', color: d.id === platform ? '#fff' : C.ink }}
          >
            <Badge bg={d.bg} size={28}>{d.icon}</Badge>
            {d.id === platform && d.label}
          </button>
        ))}
      </div>
      <p className="flex-none pb-3 text-center text-[19px] font-extrabold tracking-[-0.01em]" aria-live="polite">{caption || ' '}</p>
      <div ref={boxRef} className="min-h-0 flex-1 overflow-hidden px-5">
        {phoneWidth > 0 && <ShareDemo key={`${platform}-${os}`} platform={platform} os={os} width={phoneWidth} onCaption={setCaption} />}
      </div>
      <div className="flex flex-none flex-col items-center gap-1 px-5 pt-4">
        {tab.app && tab.url ? (
          <button type="button" onClick={() => void openApp(tab.url!)} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full text-[16px] font-bold text-white active:scale-[0.98]" style={{ background: tab.bg }}>
            {tab.icon} {tab.app} öffnen
          </button>
        ) : (
          <button type="button" onClick={onLink} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full text-[16px] font-bold text-white active:scale-[0.98]" style={{ background: C.cta }}>
            <Link2 size={18} /> Link einfügen
          </button>
        )}
        {tab.app && (
          <button type="button" onClick={onLink} className="px-2 py-2 text-[15px] font-semibold" style={{ color: C.cta }}>
            Link schon kopiert? Hier einfügen
          </button>
        )}
      </div>
    </div>
  );
};

const LinkStep: React.FC<{ onBack: () => void; onImport: (url: string) => void }> = ({ onBack, onImport }) => {
  const { showToast } = useNotification();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const target = value.trim() ? detectImportTarget(value) : null;
  const provider = target ? PROVIDERS[target.provider] : null;

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        // Gültiger Link: gleich importieren, ohne extra „Importieren“-Tap. Sonst einsetzen, der Hinweis erklärt den Fehler.
        const pastedTarget = detectImportTarget(text);
        if (pastedTarget) onImport(pastedTarget.url);
        else setValue(text);
        return;
      }
      showToast('In der Zwischenablage ist kein Text.', 'error');
    } catch {
      // Manche WebViews erlauben das Auslesen nicht: dann per Gedrückthalten einfügen.
      inputRef.current?.focus();
      showToast('Halte das Feld gedrückt und wähle „Einfügen“.');
    }
  };

  return (
    <div className="px-5">
      <Header title="Link einfügen" sub="Instagram, TikTok, Facebook oder eine Rezept-Webseite" onBack={onBack} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (target) onImport(target.url);
        }}
      >
        <div className="flex items-center gap-2 rounded-2xl bg-white py-1.5 pl-4 pr-1.5 shadow-[0_1px_2px_rgba(0,0,0,.05)]" style={{ outline: target ? `2px solid ${C.cta}` : undefined }}>
          <Link2 size={18} style={{ color: C.muted }} className="flex-none" />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="url"
            enterKeyHint="go"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://…"
            aria-label="Link zum Rezept"
            className="h-11 min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] focus:outline-none focus:ring-0"
          />
          {value ? (
            <button type="button" onClick={() => setValue('')} aria-label="Leeren" className="flex size-9 items-center justify-center rounded-full" style={{ color: C.muted }}>
              <X size={18} />
            </button>
          ) : (
            <button type="button" onClick={() => void paste()} className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-[14px] font-bold" style={{ background: C.soft, color: C.cta }}>
              <ClipboardPaste size={16} /> Einfügen
            </button>
          )}
        </div>

        <div className="mt-3 min-h-[36px]">
          {provider ? (
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              <Badge bg={provider.bg} size={26}>{provider.icon}</Badge>
              {provider.label} erkannt
              {target?.provider === 'website' && <span className="truncate font-normal" style={{ color: C.muted }}>· {safeHost(target.url)}</span>}
            </div>
          ) : value.trim() ? (
            <p className="text-[14px] font-semibold text-[#b4472c]">Darin steckt kein Link.</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={!target}
          className="mt-5 flex h-[52px] w-full items-center justify-center rounded-full text-[16px] font-bold text-white transition-transform active:scale-[0.98]"
          style={{ background: target ? C.cta : C.ctaOff }}
        >
          Rezept importieren
        </button>
      </form>
      <p className="mt-3 text-center text-[12.5px] leading-snug" style={{ color: C.muted }}>
        Schneller aus der App: Teilen tippen und Cookly wählen. Dann musst du nichts kopieren.
      </p>
    </div>
  );
};

const safeHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export default AddRecipeSheet;
