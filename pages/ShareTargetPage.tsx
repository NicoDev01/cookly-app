import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import UpgradeModal from '../components/UpgradeModal';

type ProcessingPhase = 'analyzing' | 'extrahieren' | 'importieren';

const ShareTargetPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const scrapePost = useAction(api.instagram.scrapePost);
    const scrapeWebsite = useAction(api.website.scrapeWebsite);
    const [status, setStatus] = useState<'idle' | 'analyzing' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [limitData, setLimitData] = useState<{ current: number, limit: number, feature: 'manual_recipes' | 'link_imports' | 'photo_scans' } | null>(null);
    const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);
    const [phase, setPhase] = useState<ProcessingPhase>('analyzing');
    const processingRef = useRef(false);
    const backButtonHandlerRef = useRef<Promise<{ remove: () => void }> | null>(null);

    const handleClose = useCallback(async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                // This specifically closes the current activity stack. 
                // Since SendIntent usually launches a new activity/task, this returns to the previous app.
                await CapacitorApp.exitApp();
            } catch (e) {
                console.error("Could not exit app:", e);
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

            const title = searchParams.get('title');
            const text = searchParams.get('text');
            const urlParam = searchParams.get('url');

            const combinedText = `${title || ''} ${text || ''} ${urlParam || ''}`;
            const instagramMatch = combinedText.match(/instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/);
            const genericUrlMatch = combinedText.match(/(https?:\/\/[^\s]+)/);

            try {
                if (instagramMatch) {
                    const postUrl = `https://www.instagram.com/${instagramMatch[1]}/${instagramMatch[2]}/`;
                    setStatus('analyzing');

                    // Phase 1: Analysieren
                    setPhase('analyzing');
                    await new Promise(r => setTimeout(r, 1500));

                    // Phase 2: Extrahieren
                    setPhase('extrahieren');

                    const recipeId = await scrapePost({ url: postUrl });

                    // Phase 3: Importieren
                    setPhase('importieren');
                    await new Promise(r => setTimeout(r, 800));

                    setSavedRecipeId(recipeId);
                    setStatus('success');
                } else if (genericUrlMatch) {
                    const websiteUrl = genericUrlMatch[1];
                    setStatus('analyzing');

                    // Phase 1: Analysieren
                    setPhase('analyzing');
                    await new Promise(r => setTimeout(r, 1500));

                    // Phase 2: Extrahieren
                    setPhase('extrahieren');

                    const recipeId = await scrapeWebsite({ url: websiteUrl });

                    // Phase 3: Importieren
                    setPhase('importieren');
                    await new Promise(r => setTimeout(r, 800));

                    setSavedRecipeId(recipeId);
                    setStatus('success');
                } else {
                    setError("Kein gültiger Link gefunden. Bitte teile eine URL.");
                    setStatus('error');
                }
            } catch (err: any) {
                console.error(err);
                const msg = err.message || "";

                // Try to parse structured error JSON
                try {
                    const errorData = JSON.parse(msg);

                    if (errorData.type === "LIMIT_REACHED") {
                        setLimitData({
                            feature: errorData.feature || 'link_imports',
                            current: errorData.current || 0,
                            limit: errorData.limit || 50
                        });
                        setStatus('error');
                    } else if (errorData.type === "RATE_LIMIT_EXCEEDED") {
                        setError("Du hast zu viele Anfragen gestellt. Bitte warte einen Moment.");
                        setStatus('error');
                    } else if (errorData.type === "API_UNAVAILABLE") {
                        setError(errorData.message || "Der Service ist gerade nicht verfügbar.");
                        setStatus('error');
                    } else {
                        setError(msg || "Ein unerwarteter Fehler ist aufgetreten.");
                        setStatus('error');
                    }
                } catch (parseError) {
                    // Fallback to string-based error detection
                    if (msg.includes("No data found") || msg.includes("parse recipe data")) {
                        setError("Kein Rezept gefunden 😕");
                        setStatus('error');
                    } else if (msg.includes("Jina AI request failed")) {
                        setError("Website konnte nicht geladen werden.");
                        setStatus('error');
                    } else {
                        setError(msg || "Ein unerwarteter Fehler ist aufgetreten.");
                        setStatus('error');
                    }
                }
            } finally {
                processingRef.current = false;
            }
        };

        if (status === 'idle') {
            handleShare();
        }
    }, [searchParams, scrapePost, scrapeWebsite, status]);

    // Native Back Button Handler - führt zu Instagram zurück während des Imports
    useEffect(() => {
        if (status !== 'analyzing') return;
        if (!Capacitor.isNativePlatform()) return;

        const setupBackButton = async () => {
            const handler = await CapacitorApp.addListener('backButton', handleClose);
            backButtonHandlerRef.current = Promise.resolve(handler);
        };

        setupBackButton();

        return () => {
            backButtonHandlerRef.current?.then(h => h.remove());
        };
    }, [status, handleClose]);

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
        </div>
    );
};

export default ShareTargetPage;

