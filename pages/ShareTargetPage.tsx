import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { api } from '../convex/_generated/api';
import type { Recipe } from '../types';
import ImportingRecipe from '../components/import/ImportingRecipe';
import ImportProgressCard from '../components/import/ImportProgressCard';
import ImportFailure, { type ImportFailureState } from '../components/import/ImportFailure';
import { IMPORT_CARD_EXIT_MS, IMPORT_CSS } from '../components/import/importStyles';
import { useCachedQuery } from '../contexts/QueryCacheContext';
import { useModal } from '../contexts/ModalContext';
import { showSimpleImportNotification } from '../utils/notifications';
import { logger } from '../utils/logger';
import { registerBackButtonOverride } from '../services/backButtonOverride';
import { getStructuredUserError, getUserErrorMessage } from '../utils/userErrors';
import { IMPORT_WAIT_TIMEOUT_MS, shouldAutoRetryImport } from '../utils/importOperationClient';
import { expectedImportStepMs, importStepFromOperation, importStepTitle } from '../utils/importProgress';
import { capture } from '../services/analytics';
import { createUuid } from '../utils/uuid';
import { preloadImage, sizedImageUrl } from '../utils/imageUrl';
import { detectImportTarget } from '../utils/importTarget';

/** Ab hier ist ein Import spürbar langsam (Instagram p50 ≈ 11 s, Nov. 2026). */
const SLOW_NOTICE_AFTER_MS = 15_000;

// Einblenden des fertigen Rezepts: Zutaten und Schritte gestaffelt, dann „fertig“ kurz stehen lassen.
const INGREDIENTS_AT_MS = 280;
const INGREDIENT_STAGGER_MS = 70;
const STEP_STAGGER_MS = 140;
const DONE_HOLD_MS = 1_400;
/** So lange wartet der Wechsel zur Rezeptseite höchstens auf das endgültige Bild. */
const HERO_WAIT_MAX_MS = 3_000;

/** Nächster scrollbarer Vorfahre (in der App der Seiten-Container aus TabsLayout). */
const scrollParent = (el: HTMLElement | null) => {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
};

/**
 * iOS meldet einen Share mehrfach (Kaltstart, Resume, Event), und jede Meldung mountet diese Seite neu
 * (App.tsx: key = location.key). Derselbe Link übernimmt dann den laufenden Import, statt sichtbar
 * von vorn zu beginnen; ist das Rezept schon offen, geht es direkt wieder dorthin.
 */
const REATTACH_WINDOW_MS = 60_000;
type LastShare = { url: string; requestId: string; operationId: string | null; startedAt: number; at: number; recipeId: string | null; notified: boolean };
let lastShare: LastShare | null = null;

const staggerCount = (elapsed: number, at: number, stagger: number, max: number) =>
  elapsed < at ? 0 : Math.min(max, Math.floor((elapsed - at) / stagger) + 1);

const revealTimeline = (recipe: Recipe) => {
  const stepsAt = INGREDIENTS_AT_MS + recipe.ingredients.length * INGREDIENT_STAGGER_MS + 120;
  const doneAt = stepsAt + Math.max(0, recipe.instructions.length - 1) * STEP_STAGGER_MS + 300;
  return { stepsAt, doneAt, leaveAt: doneAt + DONE_HOLD_MS, navigateAt: doneAt + DONE_HOLD_MS + IMPORT_CARD_EXIT_MS };
};

const INVALID_LINK: ImportFailureState = {
  kind: 'error',
  title: 'Kein Link gefunden',
  message: 'Teile den Link zu einem Rezept, zum Beispiel von Instagram, TikTok, Facebook oder einer Webseite.',
  canRetry: false,
  showFallbacks: true,
};

const failureFromError = (err: unknown): ImportFailureState => {
  const data = getStructuredUserError(err);
  if (data?.type === 'LIMIT_REACHED') {
    return {
      kind: 'limit',
      current: typeof data.current === 'number' ? data.current : 0,
      limit: typeof data.limit === 'number' ? data.limit : 60,
    };
  }
  if (data?.type === 'NO_RECIPE_CONTENT') {
    return {
      kind: 'error',
      title: 'Hier war kein Rezept drin',
      message: 'Oft steht das Rezept nur im Video. Speichere es einfach auf anderem Weg:',
      canRetry: true,
      showFallbacks: true,
    };
  }
  if (data?.type === 'IMPORT_TIMEOUT') {
    return { kind: 'error', title: 'Dauert länger als gedacht', message: getUserErrorMessage(err, 'import'), canRetry: false, showFallbacks: false };
  }
  return { kind: 'error', title: 'Das hat nicht geklappt', message: getUserErrorMessage(err, 'import'), canRetry: true, showFallbacks: true };
};

/** Millisekunden seit `since`, pro Frame aktualisiert, solange `since` gesetzt ist. */
const useElapsed = (since: number | null) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (since === null) return;
    let frame = 0;
    const loop = () => {
      setElapsed(performance.now() - since);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [since]);
  return since === null ? 0 : elapsed;
};

/**
 * Import aus dem Teilen-Menü: Sofort steht die Rezeptseite mit Platzhaltern da und füllt sich,
 * sobald das Backend liefert (importOperations: Status, Phase, Vorschaubild). Eine Card zeigt Schritt
 * und Fortschritt. Am Ende geht es nahtlos auf die echte Rezeptseite. Der Import läuft serverseitig,
 * die App darf jederzeit verlassen werden.
 */
const ShareTargetPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const convex = useConvex();
  const startImport = useMutation(api.importOperations.startImport);
  const { openAddModal } = useModal();

  const target = useMemo(
    () => detectImportTarget(`${searchParams.get('title') || ''} ${searchParams.get('text') || ''} ${searchParams.get('url') || ''}`),
    [searchParams],
  );

  const [resumed] = useState(() =>
    target && lastShare?.url === target.url && Date.now() - lastShare.at < REATTACH_WINDOW_MS ? { ...lastShare } : null,
  );
  const [attempt, setAttempt] = useState(0);
  const [operationId, setOperationId] = useState<string | null>(resumed?.operationId ?? null);
  const [startedAt, setStartedAt] = useState(() => resumed?.startedAt ?? Date.now());
  const [requestId, setRequestId] = useState<string | undefined>(resumed?.requestId);
  const [failure, setFailure] = useState<ImportFailureState | null>(target ? null : INVALID_LINK);
  const [slow, setSlow] = useState(false);
  const [revealStartedAt, setRevealStartedAt] = useState<number | null>(null);
  const autoRetriedRef = useRef(false);
  const notifiedRef = useRef(false);

  const operation = useQuery(api.importOperations.get, operationId ? { operationId } : 'skip');
  const recipeId = operation?.status === 'succeeded' ? operation.resultRecipeId : undefined;
  // Gleicher Cache-Schlüssel wie pages/RecipePage.tsx: Die Rezeptseite steht danach ohne Ladezustand da.
  const { data: recipe } = useCachedQuery<Recipe | null>(
    api.recipes.get,
    recipeId ? { id: recipeId } : 'skip',
    `recipe-${recipeId ?? 'pending'}`,
  );

  // Import starten (und bei „Nochmal versuchen“ bzw. stillem Zweitversuch neu).
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    const resume = attempt === 0 ? resumed : null;
    if (resume?.recipeId) return;
    // Gleiche requestId beim Wiederaufnehmen: startImport ist pro operationId idempotent.
    const id = resume?.requestId ?? createUuid();
    const started = resume?.startedAt ?? Date.now();
    lastShare = { url: target.url, requestId: id, operationId: resume?.operationId ?? null, startedAt: started, at: Date.now(), recipeId: null, notified: resume?.notified ?? false };
    setRequestId(id);
    if (!resume) setOperationId(null);
    setFailure(null);
    setSlow(false);
    setRevealStartedAt(null);
    setStartedAt(started);
    startImport({ operationId: id, provider: target.provider, url: target.url })
      .then((result) => {
        if (lastShare?.requestId === id) lastShare.operationId = result.operationId;
        if (!cancelled) setOperationId(result.operationId);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logger.error('ShareTarget', 'Import start failed', err);
        setFailure(failureFromError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [target, attempt, resumed, startImport]);

  // Rezeptseite schon vorladen, damit der Wechsel am Ende ohne Lade-Fallback passiert.
  useEffect(() => {
    void import('./RecipePage');
  }, []);

  // Nach einem Fehler startet derselbe Link beim nächsten Teilen wieder frisch.
  useEffect(() => {
    if (failure) lastShare = null;
  }, [failure]);

  // Doppelter Intent, nachdem das Rezept schon offen war: ohne Zwischenbild zurück aufs Rezept.
  useEffect(() => {
    if (resumed?.recipeId) navigate(`/recipe/${resumed.recipeId}`, { replace: true, state: { nav: { ids: [resumed.recipeId], index: 0 } } });
  }, [resumed, navigate]);

  // Abbruch vom Server: Dienstfehler, die schnell kamen, einmal still neu versuchen.
  useEffect(() => {
    if (!operation || (operation.status !== 'failed' && operation.status !== 'released')) return;
    const errorCode = operation.errorCode ?? 'IMPORT_FAILED';
    const durationMs = Date.now() - startedAt;
    if (!autoRetriedRef.current && shouldAutoRetryImport(errorCode, durationMs)) {
      autoRetriedRef.current = true;
      logger.warn('ShareTarget', 'service unavailable, retrying import once', { provider: target?.provider, durationMs });
      capture('import_retry_started', { provider: target?.provider, errorCode, retryCount: 1, durationMs, entryPoint: 'share_target' });
      setAttempt((value) => value + 1);
      return;
    }
    setFailure(failureFromError(new Error(JSON.stringify({ type: errorCode }))));
  }, [operation, startedAt, target]);

  const importing = !!target && !failure && revealStartedAt === null;

  // Ehrlicher Hinweis, wenn es länger dauert; nach dem Client-Timeout arbeitet der Server trotzdem weiter.
  useEffect(() => {
    if (!importing) return;
    const elapsed = Date.now() - startedAt;
    const slowTimer = window.setTimeout(() => setSlow(true), Math.max(0, SLOW_NOTICE_AFTER_MS - elapsed));
    const timeoutTimer = window.setTimeout(
      () => setFailure(failureFromError(new Error(JSON.stringify({ type: 'IMPORT_TIMEOUT' })))),
      Math.max(0, IMPORT_WAIT_TIMEOUT_MS - elapsed),
    );
    return () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(timeoutTimer);
    };
  }, [importing, startedAt]);

  const notifyImportSuccess = useCallback(async (id: string) => {
    try {
      const user = await convex.query(api.users.getCurrentUser);
      if (user?.notificationsEnabled) await showSimpleImportNotification(id);
    } catch (error) {
      logger.warn('Notifications', 'Could not read notification preference', error);
    }
  }, [convex]);

  // Rezept ist da: Einblenden starten. Fehlt es (gelöscht), ehrlich abbrechen.
  useEffect(() => {
    if (!recipeId || recipe === undefined || failure) return;
    if (recipe === null) {
      setFailure(failureFromError(new Error(JSON.stringify({ type: 'IMPORT_RESULT_MISSING' }))));
      return;
    }
    if (revealStartedAt === null) setRevealStartedAt(performance.now());
    if (!notifiedRef.current && !resumed?.notified) {
      notifiedRef.current = true;
      if (lastShare) lastShare.notified = true;
      void notifyImportSuccess(recipeId);
    }
  }, [recipeId, recipe, failure, revealStartedAt, resumed, notifyImportSuccess]);

  // Endgültiges Bild vorladen (nach dem Speichern ersetzt der Server es durch die Storage-Kopie):
  // Erst wenn es dekodiert ist, wechselt die Import-Ansicht darauf und dann zur Rezeptseite, damit dort nichts springt.
  const finalHero = recipe ? recipe.image || recipe.sourceImageUrl || '' : '';
  const [loadedHero, setLoadedHero] = useState<string | null>(null);
  useEffect(() => {
    if (!finalHero) return;
    let active = true;
    void preloadImage(sizedImageUrl(finalHero, window.innerWidth, window.devicePixelRatio || 1)).then(() => {
      if (active) setLoadedHero(finalHero);
    });
    return () => {
      active = false;
    };
  }, [finalHero]);
  const heroReady = !finalHero || loadedHero === finalHero;

  const reveal = recipe ? revealTimeline(recipe) : null;
  const revealElapsed = useElapsed(reveal && !failure ? revealStartedAt : null);
  const shouldNavigate = !!reveal && revealStartedAt !== null && revealElapsed >= reveal.navigateAt
    && (heroReady || revealElapsed >= reveal.navigateAt + HERO_WAIT_MAX_MS);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shouldNavigate || !recipeId) return;
    if (lastShare) lastShare.recipeId = recipeId;
    // Mit eigener ID-Liste: Sonst wartet RecipePage auf recipes.listIds und zeigt so lange einen Spinner.
    // seamless + scrollTop: Die Rezeptseite sieht schon aus wie diese Ansicht, also ohne Einblenden an gleicher Stelle.
    const scrollTop = scrollParent(rootRef.current)?.scrollTop ?? 0;
    navigate(`/recipe/${recipeId}`, { replace: true, state: { nav: { ids: [recipeId], index: 0 }, seamless: true, scrollTop } });
  }, [shouldNavigate, recipeId, navigate]);

  const handleClose = useCallback(async () => {
    if (Capacitor.getPlatform() === 'android') {
      try {
        // Schließt die per SendIntent gestartete Activity: zurück in die App, aus der geteilt wurde.
        await CapacitorApp.exitApp();
        return;
      } catch (e) {
        logger.error('ShareTarget', 'Could not exit app on Android', e);
      }
    }
    // iOS bietet keinen Weg zurück in die Quell-App (nur den System-Link oben links).
    if (window.history.length > 1) window.history.back();
    else navigate('/', { replace: true });
  }, [navigate]);

  // Native Back Button Override: the global handler remains the single Capacitor listener.
  useEffect(() => {
    if (!importing || !Capacitor.isNativePlatform()) return;
    return registerBackButtonOverride(handleClose);
  }, [importing, handleClose]);

  // Ausweg statt Sackgasse: Rezept per Screenshot-Scan oder von Hand speichern.
  const openFallback = useCallback((initialTab: 'ai' | 'manual') => {
    capture('import_cancelled', {
      provider: target?.provider,
      entryPoint: 'share_target',
      nextScreen: initialTab === 'ai' ? 'photo_scan' : 'manual',
    });
    navigate('/tabs/categories', { replace: true });
    openAddModal({ initialTab });
  }, [target, navigate, openAddModal]);

  const retry = useCallback(() => {
    autoRetriedRef.current = false;
    setAttempt((value) => value + 1);
  }, []);

  if (resumed?.recipeId) return null;

  if (failure) {
    return (
      <>
        <style>{IMPORT_CSS}</style>
        <ImportFailure
          failure={failure}
          onBack={handleClose}
          onRetry={retry}
          onFallback={openFallback}
          onUpgrade={() => navigate('/subscribe', { replace: true })}
        />
      </>
    );
  }

  const provider = target?.provider ?? 'website';
  const step = importStepFromOperation(operation);
  const done = !!reveal && revealElapsed >= reveal.doneAt;
  const preview = operation?.previewImageUrl || null;
  const image = finalHero && heroReady ? finalHero : preview;

  return (
    <div ref={rootRef} className={`min-h-[100dvh] bg-white ${resumed ? 'imp-instant' : ''}`}>
      <style>{IMPORT_CSS}</style>
      <ImportingRecipe
        image={image}
        imageInstant={!!preview && image !== preview}
        recipe={reveal ? recipe ?? null : null}
        ingredientCount={reveal && recipe ? staggerCount(revealElapsed, INGREDIENTS_AT_MS, INGREDIENT_STAGGER_MS, recipe.ingredients.length) : 0}
        stepCount={reveal && recipe ? staggerCount(revealElapsed, reveal.stepsAt, STEP_STAGGER_MS, recipe.instructions.length) : 0}
        onBack={handleClose}
      />
      <ImportProgressCard
        step={step}
        title={importStepTitle(step, provider)}
        expectedMs={step === 'save' && reveal ? reveal.doneAt : expectedImportStepMs(step, provider)}
        done={done}
        slow={slow}
        category={recipe?.category}
        leaving={!!reveal && revealElapsed >= reveal.leaveAt}
        instant={!!resumed}
        progressKey={requestId}
      />
    </div>
  );
};

export default ShareTargetPage;
