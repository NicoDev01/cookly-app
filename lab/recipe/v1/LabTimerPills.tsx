import React from 'react';
import { Pause, Play, Timer, X } from 'lucide-react';
import { formatClock, timerLeft, type CookTimer } from '../../../hooks/useCookTimers';

interface TimerPillsProps {
  timers: CookTimer[];
  now: number;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  /** Tipp auf Name/Zeit: zum Schritt springen. */
  onSelect: (timer: CookTimer) => void;
  className?: string;
}

/** Kapseln „❚❚ Tomaten 9:58 ×“; im Kochmodus oben, auf der Rezeptseite schwebend unten. */
const LabTimerPills: React.FC<TimerPillsProps> = ({ timers, now, onToggle, onRemove, onSelect, className = '' }) => (
  <div className={`flex min-w-0 gap-2 overflow-x-auto scrollbar-hide ${className}`}>
    <style>{`
      @keyframes cookTimerDone { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      .cook-timer-done { animation: cookTimerDone 1s ease-in-out infinite; }
    `}</style>
    {timers.map((t) => {
      const left = timerLeft(t, now);
      const done = left <= 0;
      const paused = t.endsAt === null;
      if (done) {
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onRemove(t.id)}
            aria-label={`${t.label}: Timer fertig, ausblenden`}
            className="cook-timer-done flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-[#111718]"
          >
            <Timer size={15} strokeWidth={2.25} aria-hidden />
            <span className="max-w-[96px] truncate">{t.label}</span>
            <span>fertig</span>
          </button>
        );
      }
      return (
        <div key={t.id} className="flex shrink-0 items-center rounded-full bg-gray-100 text-sm font-semibold tabular-nums text-[#111718] dark:bg-white/10 dark:text-white">
          <button
            type="button"
            onClick={() => onToggle(t.id)}
            aria-label={paused ? `${t.label}: Timer fortsetzen` : `${t.label}: Timer pausieren`}
            className="flex items-center py-1.5 pl-3 pr-1.5"
          >
            {paused ? <Play size={13} strokeWidth={2.5} aria-hidden /> : <Pause size={13} strokeWidth={2.5} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => onSelect(t)}
            aria-label={`${t.label}, noch ${formatClock(left)}, zum Schritt`}
            className={`flex items-center gap-1.5 py-1.5 pr-1 ${paused ? 'text-gray-400' : ''}`}
          >
            <span className="max-w-[96px] truncate font-medium">{t.label}</span>
            <span>{formatClock(left)}</span>
          </button>
          <button type="button" onClick={() => onRemove(t.id)} aria-label={`${t.label}: Timer löschen`} className="py-1.5 pl-1 pr-2.5 text-gray-400">
            <X size={13} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      );
    })}
  </div>
);

export default LabTimerPills;
