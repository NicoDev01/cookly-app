import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from 'convex/react';
import { Camera, Images, X, type LucideIcon } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useHaptic } from '../../hooks/useHaptic';
import UpgradeModal from '../UpgradeModal';
import { C, Header, Row } from './ui';
import type { ScanLimit } from './usePhotoScan';
import { scanJob, useScanBusy, type ScanRequest } from './scanJob';
import { useAnimatedClose, useDragToDismiss } from './motion';

const MAX_PAGES = 3;
const PAGE_HINTS = ['z. B. Zutaten', 'z. B. Zubereitung', 'Rest vom Rezept'];

type Picked = { file: File; url: string };
type Chooser = 'page' | 'dish';

/**
 * Öffnet die System-Auswahl. Mit `camera` startet Android direkt die Kamera (Capacitor: capture + image/*),
 * iOS ebenso; ohne `camera` die Galerie, mit `multiple` als Mehrfachauswahl.
 */
const pickImages = (opts: { camera?: boolean; multiple?: boolean }, onFiles: (files: File[]) => void) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (opts.camera) input.setAttribute('capture', 'environment');
  input.multiple = !!opts.multiple;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith('image/') || !file.type);
    input.remove();
    if (files.length) onFiles(files);
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  input.click();
};

const toPicked = (file: File): Picked => ({ file, url: URL.createObjectURL(file) });

/**
 * Foto scannen. „Ein Rezept“: bis zu 3 Seiten (z. B. Zutaten, Zubereitung) plus optional ein Foto vom Gericht,
 * alles in einem Scan; das Gerichtsfoto wird das Rezeptbild. „Mehrere Rezepte“: jedes Foto ein eigenes Rezept.
 * Gescannt wird im Hintergrund (PhotoScanHost): Das Sheet schließt sofort, unten läuft die Fortschritts-Card.
 */
const PhotoStep: React.FC<{ onBack: () => void; onStarted: () => void }> = ({ onBack, onStarted }) => {
  const canScanPhoto = useQuery(api.users.canScanPhoto);
  const busy = useScanBusy();
  const { showToast } = useNotification();
  const haptic = useHaptic();
  const [mode, setMode] = useState<'one' | 'many'>('one');
  const [pages, setPages] = useState<Picked[]>([]);
  const [dish, setDish] = useState<Picked | null>(null);
  const [chooser, setChooser] = useState<Chooser | null>(null);
  const [limit, setLimit] = useState<ScanLimit | null>(null);
  const [switched, setSwitched] = useState(false);

  // Vorschau-URLs beim Verlassen freigeben.
  const urlsRef = useRef<string[]>([]);
  urlsRef.current = [...pages.map((p) => p.url), ...(dish ? [dish.url] : [])];
  useEffect(() => () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  /** Limit schon vor der Fotoauswahl prüfen: Ist es erreicht, gleich Upgrade statt erst Fotos wählen. */
  const allowed = () => {
    if (canScanPhoto && !canScanPhoto.canProceed && canScanPhoto.feature && typeof canScanPhoto.current === 'number' && typeof canScanPhoto.limit === 'number') {
      void haptic.warning();
      setLimit({ feature: canScanPhoto.feature, current: canScanPhoto.current, limit: canScanPhoto.limit });
      return false;
    }
    if (busy) {
      showToast('Ein Foto-Scan läuft gerade. Danach kannst du den nächsten starten.');
      return false;
    }
    return true;
  };

  const start = (request: ScanRequest) => {
    if (!scanJob.request(request)) {
      showToast('Ein Foto-Scan läuft gerade. Danach kannst du den nächsten starten.');
      return;
    }
    void haptic.impact('medium');
    onStarted();
  };

  const addPages = (files: File[]) => setPages((list) => [...list, ...files.slice(0, MAX_PAGES - list.length).map(toPicked)]);
  const removePage = (index: number) => setPages((list) => {
    URL.revokeObjectURL(list[index].url);
    return list.filter((_, i) => i !== index);
  });
  const setDishFile = (file: File | null) => setDish((old) => {
    if (old) URL.revokeObjectURL(old.url);
    return file ? toPicked(file) : null;
  });

  const openChooser = (target: Chooser) => {
    if (target === 'page' && !pages.length && !allowed()) return;
    void haptic.impact('light');
    setChooser(target);
  };

  const choose = (camera: boolean) => {
    const target = chooser;
    setChooser(null);
    if (target === 'page') pickImages({ camera, multiple: !camera && pages.length < MAX_PAGES - 1 }, addPages);
    if (target === 'dish') pickImages({ camera }, (files) => setDishFile(files[0]));
  };

  const startMany = (camera: boolean) => {
    if (!allowed()) return;
    pickImages({ camera, multiple: !camera }, (files) => {
      // Free: nur so viele Fotos wie noch Scans frei sind, statt mittendrin am Limit abzubrechen.
      const remaining = canScanPhoto && 'remaining' in canScanPhoto && typeof canScanPhoto.remaining === 'number' ? canScanPhoto.remaining : Infinity;
      const batch = files.slice(0, remaining);
      if (batch.length < files.length) showToast(`Du hast noch ${remaining} Foto-Scans frei. Die ersten ${remaining} Fotos werden gelesen.`);
      if (batch.length) start({ kind: 'many', files: batch });
    });
  };

  return (
    <div className="relative overflow-y-auto overscroll-contain px-5">
          <Header title="Foto scannen" sub="Die KI liest Zutaten und Schritte aus deinen Fotos." onBack={onBack} />
          <div className="relative grid grid-cols-2 rounded-full bg-white p-1" role="tablist">
            {/* Gleitende Markierung statt Farbsprung: transform mit Sheet-Kurve. */}
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full shadow-[0_2px_6px_rgba(21,36,27,.25)] transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{ background: C.ink, transform: mode === 'many' ? 'translate3d(100%,0,0)' : 'translate3d(0,0,0)' }}
            />
            {([['one', 'Ein Rezept'], ['many', 'Mehrere Rezepte']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => {
                  if (mode !== id) void haptic.selection();
                  setMode(id);
                  setSwitched(true);
                }}
                className="relative h-10 rounded-full text-[14px] font-bold transition-colors duration-300 active:scale-[0.97]"
                style={{ color: mode === id ? '#fff' : C.muted }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'one' ? (
            <div key="one" className={switched ? "step-in-back" : ""}>
              <p className="mb-2 mt-5 text-[15px] font-bold">Seiten vom Rezept <span className="font-semibold" style={{ color: C.muted }}>· bis zu {MAX_PAGES}</span></p>
              <div className="grid grid-cols-3 gap-2.5">
                {pages.map((page, i) => (
                  <div key={page.url} className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)]">
                    <img src={page.url} alt={`Seite ${i + 1}`} className="size-full object-cover" />
                    <span className="absolute bottom-2 left-2 flex size-6 items-center justify-center rounded-full text-[12px] font-black text-white" style={{ background: C.cta }}>{i + 1}</span>
                    <RemoveDot label={`Seite ${i + 1} entfernen`} onClick={() => removePage(i)} />
                  </div>
                ))}
                {pages.length < MAX_PAGES && (
                  <AddTile label={pages.length ? 'Seite dazu' : 'Seite fotografieren'} hint={PAGE_HINTS[pages.length]} onClick={() => openChooser('page')} />
                )}
              </div>

              <p className="mb-2 mt-5 text-[15px] font-bold">Foto vom Gericht <span className="font-semibold" style={{ color: C.muted }}>· optional</span></p>
              <div className="grid grid-cols-3 gap-2.5">
                {dish ? (
                  <div className="relative aspect-[3/4] overflow-hidden rounded-2xl">
                    <img src={dish.url} alt="Foto vom Gericht" className="size-full object-cover" />
                    <RemoveDot label="Gerichtsfoto entfernen" onClick={() => setDishFile(null)} />
                  </div>
                ) : (
                  <AddTile label="Gericht" hint="wird das Rezeptbild" icon={Images} onClick={() => openChooser('dish')} />
                )}
                <p className="col-span-2 self-center text-[12.5px] leading-snug" style={{ color: C.muted }}>
                  Ohne Foto vom Gericht bekommt dein Rezept ein passendes Bild. Ändern kannst du es jederzeit.
                </p>
              </div>

              <button
                type="button"
                disabled={!pages.length}
                onClick={() => {
                  if (allowed()) start({ kind: 'one', pages: pages.map((p) => p.file), dish: dish?.file ?? null });
                }}
                className="mt-6 flex h-[52px] w-full items-center justify-center rounded-full text-[16px] font-bold text-white transition-transform active:scale-[0.98]"
                style={{ background: pages.length ? C.cta : C.ctaOff }}
              >
                Rezept scannen
              </button>
            </div>
          ) : (
            <div key="many" className={switched ? "step-in" : ""}>
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white p-3.5">
                <div className="flex flex-none -space-x-3">
                  {['#fbe7d6', '#dcebe1', '#efe6dc'].map((bg, i) => (
                    <span key={bg} className="block h-12 w-9 rounded-lg border-2 border-white shadow-sm" style={{ background: bg, transform: `rotate(${(i - 1) * 8}deg)` }} />
                  ))}
                </div>
                <p className="text-[14px] font-semibold leading-snug">Jedes Foto wird ein eigenes Rezept. Praktisch für einen Stapel Rezeptkarten oder Screenshots.</p>
              </div>
              <Row icon={Images} tint={C.cta} tintBg={C.soft} title="Fotos auswählen" sub="Mehrere auf einmal aus der Galerie" onClick={() => startMany(false)} />
              <Row icon={Camera} tint={C.orange} tintBg="#fbe7d6" title="Foto aufnehmen" sub="Ein Rezept pro Foto" onClick={() => startMany(true)} />
            </div>
          )}

      {chooser && createPortal(<SourceChooser onPick={choose} onCancel={() => setChooser(null)} />, document.body)}
      {limit && createPortal(
        <UpgradeModal
          isOpen
          onClose={() => setLimit(null)}
          feature={limit.feature}
          currentCount={limit.current}
          limit={limit.limit}
        />,
        document.body,
      )}
    </div>
  );
};

/** Kamera oder Galerie. Auswahl schließt sofort (die System-Auswahl braucht den Tipp als Auslöser), Abbrechen gleitet raus. */
const SourceChooser: React.FC<{ onPick: (camera: boolean) => void; onCancel: () => void }> = ({ onPick, onCancel }) => {
  const [closing, close] = useAnimatedClose(onCancel);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  useDragToDismiss(sheetRef, scrimRef, onCancel, !closing);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Foto wählen">
      <button ref={scrimRef} type="button" aria-label="Abbrechen" className={`absolute inset-0 bg-black/30 ${closing ? 'scrim-out' : 'scrim-in'}`} onClick={close} />
      <div ref={sheetRef} className={`sheet-pad relative w-full max-w-xl rounded-t-[28px] px-5 pt-3 ${closing ? 'sheet-out' : 'sheet-in'}`} style={{ background: C.bg }}>
        <div className="mx-auto mb-2 h-1 w-10 rounded-full" style={{ background: C.line }} />
        <Row icon={Camera} tint={C.orange} tintBg="#fbe7d6" title="Foto aufnehmen" onClick={() => onPick(true)} />
        <Row icon={Images} tint={C.cta} tintBg={C.soft} title="Aus Fotos wählen" onClick={() => onPick(false)} />
        <button type="button" onClick={close} className="mt-3 h-12 w-full rounded-full text-[15px] font-bold transition-transform active:scale-[0.98]" style={{ color: C.muted }}>
          Abbrechen
        </button>
      </div>
    </div>
  );
};

const AddTile: React.FC<{ label: string; hint?: string; icon?: LucideIcon; onClick: () => void }> = ({ label, hint, icon: Icon = Camera, onClick }) => (
  <button type="button" onClick={onClick} className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed bg-white/60 px-1.5 text-center active:scale-[0.97]" style={{ borderColor: C.line }}>
    <span className="flex size-10 items-center justify-center rounded-full" style={{ background: C.soft, color: C.cta }}><Icon size={19} strokeWidth={2.2} /></span>
    <span className="text-[13px] font-bold leading-tight">{label}</span>
    {hint && <span className="text-[11.5px] leading-tight" style={{ color: C.muted }}>{hint}</span>}
  </button>
);

const RemoveDot: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button type="button" onClick={onClick} aria-label={label} className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/55 text-white">
    <X size={15} strokeWidth={2.6} />
  </button>
);

export default PhotoStep;
