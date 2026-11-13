import { useSyncExternalStore } from 'react';

/** Ein Foto-Scan-Auftrag aus dem Plus-Sheet; ausgeführt von PhotoScanHost (bleibt über Tabs und Seiten hinweg aktiv). */
export type ScanRequest =
  | { kind: 'one'; pages: File[]; dish: File | null }
  | { kind: 'many'; files: File[] };

let pending: ScanRequest | null = null;
let running = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const scanJob = {
  /** Startet einen Scan im Hintergrund. false, wenn schon einer läuft. */
  request(next: ScanRequest) {
    if (running || pending) return false;
    pending = next;
    emit();
    return true;
  },
  take() {
    const next = pending;
    pending = null;
    if (next) emit();
    return next;
  },
  setRunning(value: boolean) {
    running = value;
    emit();
  },
};

/** Für das Sheet: läuft gerade ein Scan (dann keinen zweiten starten)? */
export const useScanBusy = () => useSyncExternalStore(subscribe, () => running || pending !== null);

/** Für den Host: neuer Auftrag da? */
export const usePendingScan = () => useSyncExternalStore(subscribe, () => pending);
