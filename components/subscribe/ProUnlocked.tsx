import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { ONB_IMG } from '../onboarding/onboardingData';
import { useHaptic } from '../../hooks/useHaptic';
import './proUnlocked.css';

const SPARKS = Array.from({ length: 14 }, (_, i) => i);

type Props = {
  /** Convex meldet Pro (Abgleich oder Webhook angekommen). */
  synced: boolean;
  /** Fragt RevenueCat sofort ab; `true`, wenn Pro danach aktiv ist. */
  onSync?: () => Promise<boolean>;
  onContinue: () => void;
};

/**
 * Erfolg nach Kauf oder Wiederherstellen. Per Portal am Body: In den Tab-Containern bezieht sich
 * `position: fixed` wegen der Einblend-Animation (transform) sonst auf den Container, nicht auf den Bildschirm.
 */
const ProUnlocked: React.FC<Props> = ({ synced, onSync, onContinue }) => {
  const { success } = useHaptic();
  const started = useRef(false);
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void success();
    void onSync?.().then((isPro) => { if (!isPro) setDelayed(true); }).catch(() => setDelayed(true));
  }, [success, onSync]);

  // Hintergrund steht still, solange die Karte offen ist.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('pro-ok-open');
    return () => root.classList.remove('pro-ok-open');
  }, []);

  return createPortal(
    <div className="pro-ok" role="dialog" aria-modal="true" aria-labelledby="pro-ok-title">
      <div className="pro-ok-card">
        <div className="pro-ok-art">
          {SPARKS.map((i) => (
            <span key={i} className="pro-ok-spark" style={{ '--i': i } as React.CSSProperties} />
          ))}
          <img src={ONB_IMG.pro} alt="" />
        </div>
        <h2 id="pro-ok-title">Pro ist freigeschaltet!</h2>
        <p>Importiere und scanne ab jetzt so viele Rezepte, wie du willst.</p>
        <div className={`pro-ok-sync${synced ? ' done' : ''}`}>
          {synced ? <Check size={16} strokeWidth={3} /> : <span className="pro-ok-spin" />}
          {synced ? 'Pro ist in deinem Konto aktiv' : delayed ? 'Dauert einen Moment, Pro erscheint automatisch' : 'Wird mit deinem Konto verbunden …'}
        </div>
        <button type="button" onClick={onContinue}>Los geht's</button>
      </div>
    </div>,
    document.body,
  );
};

export default ProUnlocked;
