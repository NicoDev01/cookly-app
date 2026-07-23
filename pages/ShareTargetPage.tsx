import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useConvex, useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import UpgradeModal from '../components/UpgradeModal';
import { showSimpleImportNotification } from '../utils/notifications';
import { useNotification } from '../contexts/NotificationContext';
import { logger } from '../utils/logger';
import { registerBackButtonOverride } from '../services/backButtonOverride';
import { getStructuredUserError, getUserErrorMessage } from '../utils/userErrors';
import { createPhaseSequencer, type ShareTargetPhase } from '../utils/shareTargetPhases';
import { waitForImport } from '../utils/importOperationClient';
import { createUuid } from '../utils/uuid';

type LimitFeature = 'manual_recipes' | 'link_imports' | 'photo_scans';

const isLimitFeature = (feature: unknown): feature is LimitFeature =>
    feature === 'manual_recipes' || feature === 'link_imports' || feature === 'photo_scans';

const ShareTargetPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const convex = useConvex();
    const startImport = useMutation(api.importOperations.startImport);
    const [status, setStatus] = useState<'idle' | 'analyzing' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [limitData, setLimitData] = useState<{ current: number, limit: number, feature: LimitFeature } | null>(null);
    const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);
    const [phase, setPhase] = useState<ShareTargetPhase>('analyzing');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const selectedCategoryRef = useRef<string | null>(null);
    const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const processingRef = useRef(false);
    const shareInvocationRef = useRef(0);
    
    // Global Toast aus NotificationContext
    const { showImportToast } = useNotification();

    const runWithReconnectRetry = useCallback(async (run: () => Promise<string>) => {
        const startedAt = Date.now();
        try {
            return await run();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err ?? "");
            if (!msg.includes("Connection lost while action was in flight")) {
                throw err;
            }

            const elapsedMs = Date.now() - startedAt;
            // Avoid silently doubling long imports (e.g. 45s + 45s) on flaky mobile connections.
            if (elapsedMs > 7000) {
                throw err;
            }

            logger.warn('ShareTarget', 'transient early connection loss, retrying action once', { elapsedMs });
            return await run();
        }
    }, []);

    const importLink = useCallback(async (provider: 'instagram' | 'facebook' | 'website', url: string) => {
        const operationId = createUuid();
        return runWithReconnectRetry(async () => {
            const started = await startImport({ operationId, provider, url });
            const operation = await waitForImport(convex, started.operationId);
            if (!operation.resultRecipeId) throw new Error('IMPORT_RESULT_MISSING');
            return operation.resultRecipeId;
        });
    }, [convex, runWithReconnectRetry, startImport]);

    const notifyImportSuccess = useCallback(async (recipeId: string) => {
        try {
            const user = await convex.query(api.users.getCurrentUser);
            if (user?.notificationsEnabled) await showSimpleImportNotification(recipeId);
        } catch (error) {
            logger.warn('Notifications', 'Could not read notification preference', error);
        }
    }, [convex]);

    // Kategorien & Update-Mutation
    const categories = useQuery(api.categories.list);
    const updateRecipe = useMutation(api.recipes.updateRecipe);

    const handleClose = useCallback(async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                // This specifically closes the current activity stack. 
                // Since SendIntent usually launches a new activity/task, this returns to the previous app.
                await CapacitorApp.exitApp();
            } catch (e) {
                logger.error('ShareTarget', 'Could not exit app', e);
                window.history.back();
            }
        } else {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                navigate('/', { replace: true });
            }
        }
    }, [navigate]);

    useEffect(() => {
        // DEV: Preview mode for UI testing without actual import
        const previewMode = searchParams.get('preview');
        if (previewMode) {
            if (previewMode === 'analyzing') {
                setStatus('analyzing');
                setPhase('analyzing');
            } else if (previewMode === 'extrahieren') {
                setStatus('analyzing');
                setPhase('extrahieren');
            } else if (previewMode === 'importieren') {
                setStatus('analyzing');
                setPhase('importieren');
            } else if (previewMode === 'success') {
                setStatus('success');
                setSavedRecipeId('preview123');
            } else if (previewMode === 'error') {
                setError("Kein Rezept gefunden 😕");
                setStatus('error');
            }
            return;
        }

        const handleShare = async () => {
            if (processingRef.current) return;
            processingRef.current = true;

            shareInvocationRef.current += 1;
            const shareRunId = shareInvocationRef.current;
            logger.debug('ShareTarget', `handleShare start #${shareRunId}`);

            const title = searchParams.get('title');
            const text = searchParams.get('text');
            const urlParam = searchParams.get('url');

            const combinedText = `${title || ''} ${text || ''} ${urlParam || ''}`;
            logger.debug('ShareTarget', `#${shareRunId} params`, { title, text, urlParam });
            const instagramMatch = combinedText.match(/https?:\/\/(?:(?:www|m)\.)?instagram\.com\/(?:p\/[A-Za-z0-9_-]+|reel\/[A-Za-z0-9_-]+|share\/(?:p|reel)\/[A-Za-z0-9_-]+)(?:[^\s]*)/i);
            const facebookMatch = combinedText.match(/https?:\/\/(?:(?:www|m)\.)?(?:facebook\.com|fb\.watch)\/[^\s]+/i);
            const genericUrlMatch = combinedText.match(/(https?:\/\/[^\s]+)/);

            try {
                const phaseSequencer = createPhaseSequencer({ onPhase: setPhase });

                if (instagramMatch) {
                    const postUrl = instagramMatch[0];
                    logger.debug('ShareTarget', `#${shareRunId} instagramMatch`, { postUrl });
                    setStatus('analyzing');
                    const startedAt = Date.now();

                    // Phase 1: Analysieren
                    await phaseSequencer.show('analyzing');

                    // Phase 2: Extrahieren
                    await phaseSequencer.show('extrahieren');

                    const recipeId = await importLink('instagram', postUrl);
                    logger.debug('ShareTarget', `#${shareRunId} scrapePost result`, { recipeId });

                    // Phase 3: Importieren
                    await phaseSequencer.show('importieren');

                    setSavedRecipeId(recipeId);
                    await phaseSequencer.finish();
                    setStatus('success');
                    showImportToast(recipeId); // Global Toast anzeigen
                    void notifyImportSuccess(recipeId);
                    logger.debug('ShareTarget', `#${shareRunId} instagram totalMs`, { totalMs: Date.now() - startedAt });
                    if (selectedCategoryRef.current) {
                        updateRecipe({ id: recipeId as Id<"recipes">, category: selectedCategoryRef.current }).catch(() => {});
                    }
                } else if (facebookMatch) {
                    const postUrl = facebookMatch[0];
                    logger.debug('ShareTarget', `#${shareRunId} facebookMatch`, { postUrl });
                    setStatus('analyzing');
                    const startedAt = Date.now();

                    // Phase 1: Analysieren
                    await phaseSequencer.show('analyzing');

                    // Phase 2: Extrahieren
                    await phaseSequencer.show('extrahieren');

                    const recipeId = await importLink('facebook', postUrl);
                    logger.debug('ShareTarget', `#${shareRunId} scrapeFacebookPost result`, { recipeId });

                    // Phase 3: Importieren
                    await phaseSequencer.show('importieren');

                    setSavedRecipeId(recipeId);
                    await phaseSequencer.finish();
                    setStatus('success');
                    showImportToast(recipeId); // Global Toast anzeigen
                    void notifyImportSuccess(recipeId);
                    logger.debug('ShareTarget', `#${shareRunId} facebook totalMs`, { totalMs: Date.now() - startedAt });
                    if (selectedCategoryRef.current) {
                        updateRecipe({ id: recipeId as Id<"recipes">, category: selectedCategoryRef.current }).catch(() => {});
                    }
                } else if (genericUrlMatch) {
                    const websiteUrl = genericUrlMatch[1];
                    logger.debug('ShareTarget', `#${shareRunId} genericUrlMatch`, { websiteUrl });
                    setStatus('analyzing');
                    const startedAt = Date.now();

                    // Phase 1: Analysieren
                    await phaseSequencer.show('analyzing');

                    // Phase 2: Extrahieren
                    await phaseSequencer.show('extrahieren');

                    const recipeId = await importLink('website', websiteUrl);
                    logger.debug('ShareTarget', `#${shareRunId} scrapeWebsite result`, { recipeId });

                    // Phase 3: Importieren
                    await phaseSequencer.show('importieren');

                    setSavedRecipeId(recipeId);
                    await phaseSequencer.finish();
                    setStatus('success');
                    showImportToast(recipeId); // Global Toast anzeigen
                    void notifyImportSuccess(recipeId);
                    logger.debug('ShareTarget', `#${shareRunId} website totalMs`, { totalMs: Date.now() - startedAt });
                    if (selectedCategoryRef.current) {
                        updateRecipe({ id: recipeId as Id<"recipes">, category: selectedCategoryRef.current }).catch(() => {});
                    }
                } else {
                    setError("Kein gültiger Link gefunden. Bitte teile eine URL.");
                    setStatus('error');
                }
            } catch (err: unknown) {
                logger.error('ShareTarget', 'Import failed', err);
                const msg = err instanceof Error ? err.message : String(err ?? "");
                logger.error('ShareTarget', `#${shareRunId} error`, { msg });

                const errorData = getStructuredUserError(err);
                if (errorData?.type === "LIMIT_REACHED") {
                    setLimitData({
                        feature: isLimitFeature(errorData.feature) ? errorData.feature : 'link_imports',
                        current: typeof errorData.current === 'number' ? errorData.current : 0,
                        limit: typeof errorData.limit === 'number' ? errorData.limit : 60
                    });
                    setStatus('error');
                } else {
                    setError(getUserErrorMessage(err, 'import'));
                    setStatus('error');
                }
            } finally {
                logger.debug('ShareTarget', `handleShare end #${shareRunId}`);
                processingRef.current = false;
            }
        };

        if (status === 'idle') {
            handleShare();
        }
    }, [searchParams, importLink, notifyImportSuccess, showImportToast, status, updateRecipe]);

    // Native Back Button Override: the global handler remains the single Capacitor listener.
    useEffect(() => {
        if (status !== 'analyzing') return;
        if (!Capacitor.isNativePlatform()) return;

        return registerBackButtonOverride(handleClose);
    }, [status, handleClose]);

    // Click outside to close dropdown - Mobile UX best practice
    useEffect(() => {
        if (!isCategoryDropdownOpen) return;

        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsCategoryDropdownOpen(false);
            }
        };

        // Add both mouse and touch events for mobile compatibility
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isCategoryDropdownOpen]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background-light dark:bg-background-dark p-6 relative overflow-hidden">
            
            {/* Background Decorative Blurs */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 blur-[100px] rounded-full pointer-events-none" />

            <UpgradeModal 
                isOpen={!!limitData} 
                onClose={() => {
                    setLimitData(null);
                    handleClose();
                }}
                currentCount={limitData?.current}
                limit={limitData?.limit}
                feature={limitData?.feature}
            />

            <div className="w-full max-w-sm z-10">
                {status === 'analyzing' && (
                    <div className="flex flex-col items-center gap-10 animate-in fade-in duration-500">
                        {/* Einfacher runder Spinner */}
                        <div className="relative">
                            <div className="size-20 border-4 border-primary/20 rounded-full" />
                            <div className="absolute top-0 left-0 size-20 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>

                        {/* Animierte Texte */}
                        <div className="space-y-2 text-center">
                            <h2 className="text-3xl font-black text-text-primary-light dark:text-text-primary-dark tracking-tight">
                                {phase === 'analyzing' && (
                                    <span key="analyzing" className="animate-in fade-in duration-300">
                                        Wird analysiert
                                    </span>
                                )}
                                {phase === 'extrahieren' && (
                                    <span key="extrahieren" className="animate-in fade-in duration-300">
                                        Wird extrahiert
                                    </span>
                                )}
                                {phase === 'importieren' && (
                                    <span key="importieren" className="animate-in fade-in duration-300">
                                        Wird importiert
                                    </span>
                                )}
                            </h2>
                            <p className="text-text-secondary-light dark:text-text-secondary-dark text-lg px-4">
                                Prozess läuft im Hintergrund weiter...
                                <br />
                                Kehre ohne unterbrechung zu deiner App zurück
                            </p>
                        </div>

                        {/* Home & Zurück Buttons */}
                        <div className="flex gap-3 w-full pt-4">
                            <button
                                onClick={() => navigate('/tabs/categories')}
                                className="touch-btn flex-1 px-6 py-4 bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark rounded-2xl font-bold flex items-center justify-center gap-2 elevation-1 active:scale-95 transition-all"
                            >
                                <span className="material-symbols-outlined">home</span>
                                Home
                            </button>
                            <button
                                onClick={handleClose}
                                className="touch-btn flex-1 px-6 py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all"
                            >
                                <span className="material-symbols-outlined">arrow_back</span>
                                Zurück
                            </button>
                        </div>

                        {/* Optionale Kategorie-Zuweisung - UNTER den Buttons */}
                        <div ref={dropdownRef} className="w-fit mx-auto mt-6 relative min-w-[200px] max-w-[280px]">
                            <p className="text-sm text-text-primary-light dark:text-text-primary-dark mb-3 text-center">
                                Direkt einer Kategorie zuweisen <span className="font-bold">(Optional)</span>
                            </p>
                            
                            {/* Trigger Button */}
                            <button
                                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                                className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark border border-gray-200 dark:border-gray-700 elevation-1 touch-manipulation flex items-center justify-between gap-2 active:scale-[0.98] transition-transform"
                                style={{ fontSize: '16px' }}
                                aria-haspopup="listbox"
                            >
                                <span className="truncate">
                                    {selectedCategory ?? "Automatisch zuweisen"}
                                </span>
                                <span className={`material-symbols-outlined text-text-secondary-light dark:text-text-secondary-dark transition-transform duration-200 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`}>
                                    expand_more
                                </span>
                            </button>
                            
                            {/* Dropdown Menu - öffnet nach OBEN */}
                            {isCategoryDropdownOpen && (
                                <div
                                    className="absolute bottom-full left-0 right-0 mb-2 max-h-[280px] overflow-y-auto rounded-2xl bg-card-light dark:bg-card-dark border border-gray-200 dark:border-gray-700 elevation-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
                                    role="listbox"
                                    style={{ WebkitOverflowScrolling: 'touch', minWidth: '100%' }}
                                >
                                    {categories === undefined ? (
                                        <div className="flex items-center justify-center py-4">
                                            <div className="size-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                                        </div>
                                    ) : (
                                        <>
                                            {/* Auto Option */}
                                            <button
                                                onClick={() => {
                                                    setSelectedCategory(null);
                                                    selectedCategoryRef.current = null;
                                                    setIsCategoryDropdownOpen(false);
                                                }}
                                                className={`w-full min-h-[44px] px-4 py-3 text-left touch-manipulation active:bg-primary/10 transition-colors truncate ${selectedCategory === null ? 'bg-primary/5 text-primary font-medium' : 'text-text-primary-light dark:text-text-primary-dark'}`}
                                                role="option"
                                                aria-selected={selectedCategory === null}
                                            >
                                                Automatisch zuweisen
                                            </button>
                                            
                                            {/* Divider */}
                                            {categories.length > 0 && (
                                                <div className="h-px bg-gray-200 dark:bg-gray-700 mx-4" />
                                            )}
                                            
                                            {/* User Categories */}
                                            {categories.map((cat) => (
                                                <button
                                                    key={cat._id}
                                                    onClick={() => {
                                                        setSelectedCategory(cat.name);
                                                        selectedCategoryRef.current = cat.name;
                                                        setIsCategoryDropdownOpen(false);
                                                    }}
                                                    className={`w-full min-h-[44px] px-4 py-3 text-left touch-manipulation active:bg-primary/10 transition-colors truncate ${selectedCategory === cat.name ? 'bg-primary/5 text-primary font-medium' : 'text-text-primary-light dark:text-text-primary-dark'}`}
                                                    role="option"
                                                    aria-selected={selectedCategory === cat.name}
                                                >
                                                    {cat.name}
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {status === 'success' && (
                    <div className="flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-500">
                        <div className="size-28 rounded-[2.5rem] bg-green-500 flex items-center justify-center text-white shadow-[0_20px_40px_-10px_rgba(34,197,94,0.4)] relative">
                             <div className="absolute inset-0 rounded-[2.5rem] animate-ping bg-green-500/20" />
                            <span className="material-symbols-outlined text-6xl filled">check_circle</span>
                        </div>

                        <div className="space-y-2">
                            <h2 className="text-3xl font-black text-text-primary-light dark:text-text-primary-dark tracking-tight">
                                Fertig! ✨
                            </h2>
                            <p className="text-text-secondary-light dark:text-text-secondary-dark text-lg">
                                Das Rezept wurde sicher in deiner Sammlung gespeichert.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 w-full mt-4">
                            <button
                                onClick={() => navigate(`/recipe/${savedRecipeId}`)}
                                className="touch-btn w-full px-6 py-5 bg-primary text-white rounded-2xl shadow-xl font-black text-lg flex items-center justify-center gap-2 elevation-3"
                            >
                                <span className="material-symbols-outlined">menu_book</span>
                                Rezept ansehen
                            </button>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => navigate('/tabs/categories')}
                                    className="touch-btn flex-1 px-6 py-4 bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark rounded-2xl font-bold elevation-1 active:scale-95 transition-all"
                                >
                                    <span className="material-symbols-outlined">home</span>
                                    Home
                                </button>
                                <button
                                    onClick={handleClose}
                                    className="touch-btn flex-1 px-6 py-4 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined">arrow_back</span>
                                    Zurück
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {status === 'error' && !limitData && (
                    <div className="flex flex-col items-center gap-8 animate-in slide-in-from-bottom-8 duration-500">
                        <div className="size-24 rounded-[2rem] bg-red-50 dark:bg-red-950 flex items-center justify-center text-red-500 shadow-lg shadow-red-500/10">
                            <span className="material-symbols-outlined text-5xl">error</span>
                        </div>
                        
                        <div className="space-y-2">
                            <h2 className="text-3xl font-black text-text-primary-light dark:text-text-primary-dark tracking-tight">
                                Oh nein!
                            </h2>
                            <p className="text-text-secondary-light dark:text-text-secondary-dark text-lg px-4">
                                {error || "Ein kleiner Fehler ist passiert."}
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 w-full mt-6">
                            <button
                                onClick={() => setStatus('idle')}
                                className="touch-btn w-full px-6 py-5 bg-primary text-white rounded-2xl shadow-lg font-black text-lg flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined">refresh</span>
                                Erneut versuchen
                            </button>
                            <button
                                onClick={handleClose}
                                className="touch-btn w-full px-6 py-4 bg-card-light dark:bg-card-dark text-text-secondary-light dark:text-text-secondary-dark rounded-2xl font-bold elevation-1"
                            >
                                Zurück
                            </button>
                        </div>
                    </div>
                 )}
            </div>

            {/* Toast wird jetzt global über NotificationContext gerendert */}
        </div>
    );
};

export default ShareTargetPage;

