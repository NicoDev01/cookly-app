import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import type { Id } from '../../convex/_generated/dataModel';
import { useNotification } from '../../contexts/NotificationContext';
import { useHaptic } from '../../hooks/useHaptic';
import { approachPercent } from '../../utils/importProgress';
import ImportProgressCard from '../import/ImportProgressCard';
import { IMPORT_CSS } from '../import/importStyles';
import { shouldShowNav } from '../AppNav';
import UpgradeModal from '../UpgradeModal';
import { scanJob, usePendingScan } from './scanJob';
import { usePhotoScan, type ScanProgress } from './usePhotoScan';

const DONE_VISIBLE_MS = 1400;
const LEAVE_MS = 450;
const TICK_MS = 120;

/** Erwartete Dauer je Abschnitt; der Balken nähert sich dem Ziel nur an und steht so nie still. */
const target = (progress: ScanProgress): { to: number; ms: number } => {
  if (progress.kind === 'many') return { to: ((progress.done + 0.92) / progress.total) * 100, ms: 14_000 };
  if (progress.stage === 'upload') return { to: 22, ms: 2_500 };
  // Lesen und Speichern laufen zusammen auf dem Server.
  return { to: 94, ms: 14_000 };
};

const title = (progress: ScanProgress, pages: number) => {
  if (progress.kind === 'many') return `Rezept ${Math.min(progress.done + 1, progress.total)} von ${progress.total} wird gelesen`;
  if (progress.stage === 'upload') return pages > 1 ? 'Fotos werden hochgeladen' : 'Foto wird hochgeladen';
  return pages > 1 ? `${pages} Seiten werden gelesen` : 'Rezept wird erkannt';
};

/** Fortschritt ohne Rücksprünge: Jeder Abschnitt startet beim aktuellen Wert. */
const useCreepingPercent = (progress: ScanProgress | null) => {
  const [percent, setPercent] = useState(0);
  const percentRef = useRef(0);
  const key = progress ? (progress.kind === 'many' ? `m${progress.done}` : progress.stage) : null;
  useEffect(() => {
    if (!progress) {
      percentRef.current = 0;
      return;
    }
    const base = percentRef.current;
    const { to, ms } = target(progress);
    const startedAt = Date.now();
    const tick = () => {
      percentRef.current = approachPercent(base, to, Date.now() - startedAt, ms);
      setPercent(percentRef.current);
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
    // Nur bei neuem Abschnitt neu ansetzen, nicht bei jedem Render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return percent;
};

/**
 * Führt Foto-Scans aus dem Plus-Sheet im Hintergrund aus und zeigt unten die Fortschritts-Card wie beim
 * Link-Import. Liegt in TabsLayout, damit der Scan beim Wechsel von Tab oder Seite weiterläuft.
 * Fertig: Card zeigt kurz den Haken, danach der bekannte Toast „Rezept importiert“ zum Öffnen.
 */
const PhotoScanHost: React.FC = () => {
  const { pathname } = useLocation();
  const { showImportToast, showToast } = useNotification();
  const haptic = useHaptic();
  const pendingRequest = usePendingScan();
  const [pages, setPages] = useState(1);
  const [finished, setFinished] = useState<{ recipeId: Id<'recipes'>; text?: string; count: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [visible, setVisible] = useState(false);

  const scan = usePhotoScan((recipeId, message, count = 1) => setFinished({ recipeId, text: message?.text, count }));
  const percent = useCreepingPercent(scan.progress);

  // Neuer Auftrag aus dem Sheet.
  useEffect(() => {
    if (!pendingRequest) return;
    const request = scanJob.take();
    if (!request) return;
    scanJob.setRunning(true);
    setFinished(null);
    setLeaving(false);
    setVisible(true);
    setPages(request.kind === 'one' ? request.pages.length : 1);
    const job = request.kind === 'one' ? scan.scanOne(request.pages, request.dish) : scan.scanEach(request.files);
    void job.finally(() => scanJob.setRunning(false));
  }, [pendingRequest, scan]);

  // Fertig: Haken zeigen, ausblenden, dann Toast zum Öffnen.
  useEffect(() => {
    if (!finished) return;
    void haptic.success();
    const leave = window.setTimeout(() => setLeaving(true), DONE_VISIBLE_MS);
    const done = window.setTimeout(() => {
      setVisible(false);
      showImportToast(finished.recipeId, finished.text ?? 'Tippe zum Ansehen');
    }, DONE_VISIBLE_MS + LEAVE_MS);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
    // haptic ist pro Render neu; nur auf das Ergebnis reagieren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, showImportToast]);

  // Fehler: Card ausblenden, Meldung als Toast (das Sheet ist längst zu).
  useEffect(() => {
    if (!scan.error) return;
    void haptic.error();
    setLeaving(true);
    showToast(scan.error, 'error');
    scan.clearError();
    const id = window.setTimeout(() => setVisible(false), LEAVE_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.error]);

  // Abgebrochen oder Limit: Card ohne Toast ausblenden.
  useEffect(() => {
    if (!visible || scan.progress || finished || scan.error) return;
    const id = window.setTimeout(() => setLeaving(true), 200);
    const hide = window.setTimeout(() => setVisible(false), 200 + LEAVE_MS);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(hide);
    };
  }, [visible, scan.progress, finished, scan.error]);

  const aboveNav = shouldShowNav(pathname);
  return (
    <>
      {visible && (
        <>
          <style>{IMPORT_CSS}</style>
          <ImportProgressCard
            step="extract"
            title={scan.progress ? title(scan.progress, pages) : 'Wird gespeichert'}
            expectedMs={1}
            done={!!finished}
            doneTitle={finished && finished.count > 1 ? `${finished.count} Rezepte sind fertig!` : undefined}
            slow={false}
            leaving={leaving}
            percent={percent}
            bottom={aboveNav
              ? 'calc(var(--nav-height) + var(--safe-area-inset-bottom, 0px) + 0.75rem)'
              : 'calc(var(--safe-area-inset-bottom, 0px) + 1rem)'}
          />
        </>
      )}
      {scan.limit && createPortal(
        <UpgradeModal
          isOpen
          onClose={scan.clearLimit}
          feature={scan.limit.feature}
          currentCount={scan.limit.current}
          limit={scan.limit.limit}
        />,
        document.body,
      )}
    </>
  );
};

export default PhotoScanHost;
