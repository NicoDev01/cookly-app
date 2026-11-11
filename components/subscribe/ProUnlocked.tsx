import React, { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { ONB_IMG } from '../onboarding/onboardingData';
import { useHaptic } from '../../hooks/useHaptic';
import './proUnlocked.css';

const SPARKS = Array.from({ length: 14 }, (_, i) => i);

/**
 * Erfolg nach Kauf oder Wiederherstellen. Der Store hat bestätigt; Convex setzt Pro per Webhook
 * Sekunden später. Bis dahin zeigt die Karte ehrlich „wird mit deinem Konto verbunden“.
 */
const ProUnlocked: React.FC<{ synced: boolean; onContinue: () => void }> = ({ synced, onContinue }) => {
  const { success } = useHaptic();
  const buzzed = useRef(false);

  useEffect(() => {
    if (buzzed.current) return;
    buzzed.current = true;
    void success();
  }, [success]);

  return (
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
          {synced ? 'Pro ist in deinem Konto aktiv' : 'Wird mit deinem Konto verbunden …'}
        </div>
        <button type="button" onClick={onContinue}>Los geht's</button>
      </div>
    </div>
  );
};

export default ProUnlocked;
