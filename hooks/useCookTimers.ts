import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ensureNotificationPermission } from '../utils/notifications';

/**
 * Koch-Timer, die das Schließen des Kochmodus überleben (State liegt in der Rezeptseite).
 * Ablauf: Ton + Haptik im Vordergrund, native Benachrichtigung für gesperrten Bildschirm / Hintergrund.
 */

export interface CookTimer {
  id: string;
  /** z. B. "Tomaten" */
  label: string;
  /** Schritt, aus dem der Timer kommt (zum Hinspringen). */
  step: number;
  total: number;
  /** null = pausiert */
  endsAt: number | null;
  remaining: number;
  notificationId: number;
}

export const timerLeft = (t: CookTimer, now: number) => (t.endsAt === null ? t.remaining : (t.endsAt - now) / 1000);

export const formatClock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

const CHANNEL_ID = 'cook-timer';
const isNative = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

let channelReady = false;
const ensureNotifications = async (): Promise<boolean> => {
  if (!isNative()) return false;
  try {
    if (!(await ensureNotificationPermission('cook_timer'))) return false;
    if (!channelReady && Capacitor.getPlatform() === 'android') {
      await LocalNotifications.createChannel({ id: CHANNEL_ID, name: 'Koch-Timer', importance: 5, visibility: 1, vibration: true });
      channelReady = true;
    }
    return true;
  } catch {
    return false;
  }
};

const scheduleNotification = async (t: CookTimer, recipeId?: string) => {
  if (t.endsAt === null || !(await ensureNotifications())) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: t.notificationId,
        title: 'Timer fertig',
        body: `${t.label} · ${formatClock(t.total)}`,
        schedule: { at: new Date(t.endsAt), allowWhileIdle: true },
        channelId: CHANNEL_ID,
        // Tipp auf die Benachrichtigung öffnet das Rezept (App.tsx).
        extra: recipeId ? { type: 'cook-timer', recipeId } : undefined,
      }],
    });
  } catch { /* Benachrichtigung ist Zusatz, Timer läuft trotzdem */ }
};

const cancelNotification = (t: CookTimer) => {
  if (!isNative()) return;
  LocalNotifications.cancel({ notifications: [{ id: t.notificationId }] }).catch(() => undefined);
};

/** Kurzer, freundlicher Dreiklang über Web Audio; muss einmal per Tipp freigeschaltet werden (iOS). */
const playChime = (ctx: AudioContext | null) => {
  if (!ctx) return;
  const start = ctx.currentTime;
  for (let round = 0; round < 3; round++) {
    [880, 1175, 1568].forEach((freq, i) => {
      const t0 = start + round * 0.9 + i * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    });
  }
};

/** recipeId: für den Sprung zurück ins Rezept beim Tipp auf die Benachrichtigung. */
export const useCookTimers = (recipeId?: string) => {
  const [timers, setTimers] = useState<CookTimer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const audio = useRef<AudioContext | null>(null);
  const alerted = useRef(new Set<string>());

  // Takt nur, solange einer läuft.
  const anyRunning = timers.some((t) => t.endsAt !== null);
  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [anyRunning]);

  // Abgelaufen: einmal Ton + Haptik.
  useEffect(() => {
    for (const t of timers) {
      if (t.endsAt !== null && timerLeft(t, now) <= 0 && !alerted.current.has(t.id)) {
        alerted.current.add(t.id);
        playChime(audio.current);
        if (isNative()) Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
        else navigator.vibrate?.([200, 100, 200]);
      }
    }
  }, [now, timers]);

  const start = useCallback((id: string, label: string, step: number, seconds: number) => {
    // Tipp = Nutzergeste: Audio hier freischalten, damit der Ton später spielen darf.
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!audio.current && Ctx) audio.current = new Ctx();
      audio.current?.resume().catch(() => undefined);
    } catch { /* ohne Ton weiter */ }

    const startedAt = Date.now();
    setNow(startedAt);
    setTimers((list) => {
      if (list.some((t) => t.id === id)) return list; // läuft schon
      alerted.current.delete(id);
      const timer: CookTimer = {
        id, label, step, total: seconds, endsAt: startedAt + seconds * 1000, remaining: seconds,
        notificationId: (startedAt % 2_000_000_000) + list.length,
      };
      void scheduleNotification(timer, recipeId);
      return [...list, timer];
    });
  }, [recipeId]);

  const toggle = useCallback((id: string) => {
    const at = Date.now();
    setNow(at);
    setTimers((list) => list.map((t) => {
      if (t.id !== id || timerLeft(t, at) <= 0) return t;
      if (t.endsAt === null) {
        const resumed = { ...t, endsAt: at + t.remaining * 1000 };
        void scheduleNotification(resumed, recipeId);
        return resumed;
      }
      cancelNotification(t);
      return { ...t, endsAt: null, remaining: timerLeft(t, at) };
    }));
  }, [recipeId]);

  const remove = useCallback((id: string) => {
    setTimers((list) => {
      const t = list.find((x) => x.id === id);
      if (t) cancelNotification(t);
      return list.filter((x) => x.id !== id);
    });
  }, []);

  /** Abgelaufene wegräumen (z. B. bei „Kochen beenden“). */
  const clearDone = useCallback(() => {
    const at = Date.now();
    setTimers((list) => list.filter((t) => timerLeft(t, at) > 0));
  }, []);

  return { timers, now, start, toggle, remove, clearDone };
};

export type CookTimersApi = ReturnType<typeof useCookTimers>;
