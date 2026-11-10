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
import { detectImportTarget } from '../utils/importTarget';

/** Ab hier ist ein Import spürbar langsam (Instagram p50 ≈ 11 s, Nov. 2026). */
const SLOW_NOTICE_AFTER_MS = 15_000;

// Einblenden des fertigen Rezepts: Zutaten und Schritte gestaffelt, dann „fertig“ kurz stehen lassen.
const INGREDIENTS_AT_MS = 280;
const INGREDIENT_STAGGER_MS = 70;
const STEP_STAGGER_MS = 140;
const DONE_HOLD_MS = 1_400;

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

  const [attempt, setAttempt] = useState(0);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
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
    setOperationId(null);
    setFailure(null);
    setSlow(false);
    setRevealStartedAt(null);
    setStartedAt(Date.now());
    startImport({ operationId: createUuid(), provider: target.provider, url: target.url })
      .then((started) => {
        if (!cancelled) setOperationId(started.operationId);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logger.error('ShareTarget', 'Import start failed', err);
        setFailure(failureFromError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [target, attempt, startImport]);

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
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      void notifyImportSuccess(recipeId);
    }
  }, [recipeId, recipe, failure, revealStartedAt, notifyImportSuccess]);

  const reveal = recipe ? revealTimeline(recipe) : null;
  const revealElapsed = useElapsed(reveal && !failure ? revealStartedAt : null);
  const shouldNavigate = !!reveal && revealStartedAt !== null && revealElapsed >= reveal.navigateAt;

  useEffect(() => {
    if (shouldNavigate && recipeId) navigate(`/recipe/${recipeId}`, { replace: true });
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
  const image = operation?.previewImageUrl || recipe?.image || recipe?.sourceImageUrl || null;

  return (
    <div className="min-h-[100dvh] bg-white">
      <style>{IMPORT_CSS}</style>
      <ImportingRecipe
        image={image}
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
      />
    </div>
  );
};

export default ShareTargetPage;
