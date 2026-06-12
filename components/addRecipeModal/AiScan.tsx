import React from "react";

type AiScanPanelProps = {
  editAfterScan: boolean;
  setEditAfterScan: (next: boolean) => void;

  isBusy: boolean;
  isBulkAnalyzing: boolean;
  bulkTotal: number;
  bulkProcessed: number;
  bulkErrors: number;
  isAnalyzing: boolean;

  // New: Progress states
  analysisStage: 'idle' | 'uploading' | 'analyzing' | 'retrying' | 'processing' | 'complete';
  analysisProgress: number;

  sourceImageUrl: string;

  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export const AiScanPanel: React.FC<AiScanPanelProps> = ({
  editAfterScan,
  setEditAfterScan,
  isBusy,
  isBulkAnalyzing,
  bulkTotal,
  bulkProcessed,
  bulkErrors,
  isAnalyzing,
  analysisStage,
  analysisProgress,
  sourceImageUrl,
  fileInputRef,
  onFileChange,
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full space-y-6 py-10">
      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <input
          type="checkbox"
          checked={editAfterScan}
          onChange={(e) => setEditAfterScan(e.target.checked)}
          disabled={isBusy || isBulkAnalyzing || bulkTotal > 1}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        nach Scan direkt bearbeiten
      </label>

      <div
        onClick={() => {
          if (!isBusy) fileInputRef.current?.click();
        }}
        className={`w-full max-w-sm aspect-video border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex flex-col items-center justify-center transition-all group ${
          isBusy
            ? 'cursor-not-allowed opacity-70'
            : 'cursor-pointer hover:border-primary hover:bg-primary/5'
        }`}
      >
        {sourceImageUrl ? (
          <img src={sourceImageUrl} alt="Hochgeladenes Rezeptfoto" className="w-full h-full object-cover rounded-xl" />
        ) : (
          <>
            <span className="material-symbols-outlined text-4xl text-gray-400 group-hover:text-primary mb-2">
              add_a_photo
            </span>
            <span className="text-gray-500 dark:text-gray-400 font-medium">Foto hochladen</span>
          </>
        )}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          multiple
          disabled={isBusy}
          onChange={onFileChange}
        />
      </div>

      {!isBulkAnalyzing && (
        <p className="text-xs text-gray-400 text-center max-w-xs">
          Du kannst auch mehrere Fotos auf einmal auswählen.
        </p>
      )}

      {isBulkAnalyzing && (
        <div className="text-center space-y-2">
          <div className="animate-spin text-primary text-2xl">⏳</div>
          <p className="text-gray-500 dark:text-gray-400">
            {bulkProcessed} / {bulkTotal} verarbeitet (
            {bulkTotal > 0 ? Math.round((bulkProcessed / bulkTotal) * 100) : 0}%)
          </p>
          {bulkErrors > 0 && <p className="text-xs text-gray-400">Fehler: {bulkErrors}</p>}
        </div>
      )}

      {isAnalyzing && (
        <div className="w-full max-w-sm space-y-3">
          {/* Progress Bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 min-w-[3rem] text-right">
              {analysisProgress}%
            </span>
          </div>

          {/* Stage Text */}
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            {analysisStage === 'uploading' && '📤 Bild wird vorbereitet...'}
            {analysisStage === 'analyzing' && '🤖 KI analysiert Rezept...'}
            {analysisStage === 'retrying' && 'KI ist ausgelastet. Neuer Versuch läuft...'}
            {analysisStage === 'processing' && '⚙️ Rezept wird erstellt...'}
            {analysisStage === 'complete' && '✅ Fertig!'}
          </p>

          {/* Animated Icon */}
          <div className="flex justify-center">
            {analysisStage === 'analyzing' && (
              <div className="animate-pulse text-3xl">🧠</div>
            )}
            {analysisStage === 'retrying' && (
              <span className="material-symbols-outlined animate-spin text-3xl text-primary">sync</span>
            )}
            {analysisStage === 'uploading' && (
              <div className="animate-bounce text-3xl">📷</div>
            )}
            {analysisStage === 'processing' && (
              <div className="animate-spin text-3xl">⚙️</div>
            )}
            {analysisStage === 'complete' && (
              <div className="text-3xl">✨</div>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center max-w-xs">
        Lade ein Foto von einem Kochbuch oder handgeschriebenen Zettel hoch. Die KI füllt das
        Formular automatisch aus.
      </p>
    </div>
  );
};
