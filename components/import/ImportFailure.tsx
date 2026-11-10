import React from 'react';
import { ArrowLeft, Camera, Crown, PenLine, RotateCcw } from 'lucide-react';
import { ONB_IMG } from '../onboarding/onboardingData';

export type ImportFailureState =
  | { kind: 'limit'; current: number; limit: number }
  | { kind: 'error'; title: string; message: string; canRetry: boolean; showFallbacks: boolean };

/**
 * Abbruch der Import-Seite: Die Platzhalter blenden aus, an ihre Stelle tritt ein ruhiger Screen.
 * Maskottchen, eine Zeile Ursache, ein Hauptweg nach vorn, der Rest klein.
 */
const ImportFailure: React.FC<{
  failure: ImportFailureState;
  onBack: () => void;
  onRetry: () => void;
  onFallback: (tab: 'ai' | 'manual') => void;
  onUpgrade: () => void;
}> = ({ failure, onBack, onRetry, onFallback, onUpgrade }) => (
  <main className="flex min-h-[100dvh] flex-col bg-white px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}>
    <div className="flex items-center">
      <button type="button" onClick={onBack} aria-label="Zurück" className="flex size-10 items-center justify-center rounded-full bg-card-light text-gray-800 active:scale-95 transition-transform">
        <ArrowLeft className="size-5" strokeWidth={2.5} />
      </button>
    </div>

    <div className="imp-fail flex flex-1 flex-col items-center justify-center pb-24 text-center" role="alert">
      <img src={failure.kind === 'limit' ? ONB_IMG.pro : ONB_IMG.hello} alt="" className="imp-fail-pot size-36 object-contain" />
      <h1 className="mt-4 text-[26px] font-black leading-tight tracking-tight text-[#111718]">
        {failure.kind === 'limit' ? 'Dein Import-Limit ist voll' : failure.title}
      </h1>
      <p className="mt-2 max-w-[300px] text-[15px] font-medium leading-snug text-gray-500">
        {failure.kind === 'limit'
          ? `Du hast ${failure.current} von ${failure.limit} kostenlosen Link-Importen genutzt. Mit Pro importierst du unbegrenzt.`
          : failure.message}
      </p>

      {failure.kind === 'limit' ? (
        <div className="mt-8 flex w-full max-w-sm flex-col gap-2.5">
          <button type="button" onClick={onUpgrade} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-[17px] font-black text-white shadow-lg shadow-primary/30 transition-transform active:scale-[0.98]">
            <Crown className="size-5" strokeWidth={2.5} />
            Pro freischalten
          </button>
          <button type="button" onClick={onBack} className="w-full rounded-2xl px-6 py-3 text-[15px] font-bold text-gray-500">
            Zurück
          </button>
        </div>
      ) : (
        <div className="mt-8 flex w-full max-w-sm flex-col gap-2.5">
          {failure.showFallbacks && (
            <div className="flex gap-2.5">
              <button type="button" onClick={() => onFallback('ai')} className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl bg-card-light px-3 py-4 text-[14px] font-bold text-[#111718] transition-transform active:scale-[0.98]">
                <Camera className="size-6 text-primary" strokeWidth={2.25} />
                Screenshot scannen
              </button>
              <button type="button" onClick={() => onFallback('manual')} className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl bg-card-light px-3 py-4 text-[14px] font-bold text-[#111718] transition-transform active:scale-[0.98]">
                <PenLine className="size-6 text-primary" strokeWidth={2.25} />
                Selbst eintragen
              </button>
            </div>
          )}
          <div className="flex items-center justify-center gap-5 pt-2 text-[15px] font-bold text-gray-500">
            {failure.canRetry && (
              <>
                <button type="button" onClick={onRetry} className="flex items-center gap-1.5">
                  <RotateCcw className="size-4" strokeWidth={2.5} />
                  Nochmal versuchen
                </button>
                <span className="text-gray-300" aria-hidden>·</span>
              </>
            )}
            <button type="button" onClick={onBack}>Zurück</button>
          </div>
        </div>
      )}
    </div>
  </main>
);

export default ImportFailure;
