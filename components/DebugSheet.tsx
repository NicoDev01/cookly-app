import React, { useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getRecentLogLines, clearLogs } from '../utils/logger';
import { APP_VERSION } from '../utils/appInfo';

interface DebugSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
}

/**
 * Verstecktes Entwickler-Diagnose-Sheet (Schicht 3 der Observability-Architektur,
 * siehe docs/audit-2026-06/08-ux-fehlertexte-performance.md, Teil 4).
 * Erreichbar durch 7× Tippen auf die Versionsnummer in der ProfilePage.
 * Für normale Nutzer unsichtbar und ohne Funktion.
 */
const DebugSheet: React.FC<DebugSheetProps> = ({ isOpen, onClose, userId }) => {
  // Snapshot beim Öffnen, damit die Liste nicht unter den Fingern springt.
  const logs = useMemo(() => (isOpen ? getRecentLogLines() : ''), [isOpen]);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const platform = Capacitor.getPlatform();
  const shortUserId = userId ? `${userId.slice(0, 6)}…` : 'anonym';
  const header = `Cookly ${APP_VERSION} (${platform}) · User ${shortUserId}`;
  const payload = `${header}\n\n${logs || '(keine Logs im Puffer)'}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const mailtoHref =
    `mailto:aimpact.agency@gmail.com?subject=${encodeURIComponent(`Cookly Logs ${APP_VERSION}`)}` +
    `&body=${encodeURIComponent(`${header}\n\n${(logs || '(keine Logs)').split('\n').slice(-50).join('\n')}`)}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card-light dark:bg-card-dark rounded-t-[2rem] p-6 pb-safe max-h-[85vh] flex flex-col shadow-neo-light-convex dark:shadow-neo-dark-convex"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-text-secondary-light/30 dark:bg-text-secondary-dark/30 rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-bold mb-1 text-text-primary-light dark:text-text-primary-dark">Diagnose</h2>
        <p className="text-xs font-mono text-text-secondary-light dark:text-text-secondary-dark mb-4 break-all">
          {header}
        </p>

        <pre className="flex-1 overflow-auto text-[10px] leading-relaxed font-mono bg-black/5 dark:bg-white/5 rounded-xl p-3 whitespace-pre-wrap break-all text-text-primary-light dark:text-text-primary-dark">
          {logs || '(keine Logs im Puffer)'}
        </pre>

        <div className="flex flex-col gap-2 mt-4">
          <button
            onClick={handleCopy}
            className="w-full h-12 rounded-xl bg-primary text-white font-bold active:scale-[0.98] transition-all"
          >
            {copied ? 'Kopiert ✓' : 'Logs kopieren'}
          </button>
          <a
            href={mailtoHref}
            className="w-full h-12 rounded-xl bg-card-light dark:bg-card-dark shadow-neo-light-convex dark:shadow-neo-dark-convex flex items-center justify-center font-bold text-text-primary-light dark:text-text-primary-dark"
          >
            Per E-Mail senden
          </a>
          <div className="flex gap-2">
            <button
              onClick={() => clearLogs()}
              className="flex-1 h-11 rounded-xl text-sm font-semibold text-text-secondary-light dark:text-text-secondary-dark"
            >
              Puffer leeren
            </button>
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-xl text-sm font-semibold text-text-secondary-light dark:text-text-secondary-dark"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugSheet;
