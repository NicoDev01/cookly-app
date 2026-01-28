import { useNavigate } from 'react-router-dom';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount?: number;
  limit?: number;
  feature?: 'manual_recipes' | 'link_imports' | 'photo_scans';
}

export default function UpgradeModal({
  isOpen,
  onClose,
  currentCount = 0,
  limit = 100,
  feature = 'manual_recipes'
}: UpgradeModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleUpgrade = () => {
    onClose();
    navigate('/subscribe');
  };

  const config = {
    manual_recipes: {
      title: 'Rezept Limit erreicht',
      icon: 'restaurant',
      description: `Du hast dein kostenloses Limit von ${limit} manuellen Rezepten erreicht.`,
      highlight: 'Sammle unbegrenzt Rezepte für deine digitale Küche.'
    },
    link_imports: {
      title: 'Import Limit erreicht',
      icon: 'link',
      description: `Du hast dein kostenloses Limit von ${limit} Link-Imports erreicht.`,
      highlight: 'Spare Zeit mit unbegrenzten Website-Imports.'
    },
    photo_scans: {
      title: 'Scan Limit erreicht',
      icon: 'camera_enhance',
      description: `Du hast dein kostenloses Limit von ${limit} KI-Scans erreicht.`,
      highlight: 'Digitalisiere deine Kochbuch-Sammlung unbegrenzt.'
    }
  }[feature];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-md animate-in fade-in duration-500"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative bg-white/90 dark:bg-card-dark/95 backdrop-blur-xl rounded-[2.5rem] p-8 max-w-sm w-full shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] border border-white/20 dark:border-white/5 animate-in fade-in zoom-in slide-in-from-bottom-8 duration-500">

        {/* Glow Effect */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-primary/20 blur-[80px] pointer-events-none" />

        <div className="text-center relative">
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/25 border border-white/20">
            <span className="material-symbols-outlined text-4xl text-white">
              {config.icon}
            </span>
          </div>

          <h2 className="text-2xl font-black text-text-primary-light dark:text-text-primary-dark mb-3 tracking-tight">
            {config.title}
          </h2>

          <p className="text-text-secondary-light dark:text-text-secondary-dark mb-6 leading-relaxed">
            {config.description} <br/>
            <span className="font-bold text-primary">{config.highlight}</span>
          </p>

          <div className="bg-black/5 dark:bg-white/5 rounded-3xl p-5 mb-8 border border-white/10">
            <ul className="space-y-3">
              {[
                { icon: 'all_inclusive', text: 'Unbegrenzte Rezepte & Scans' },
                { icon: 'auto_awesome', text: 'Verbesserte KI-Analysen' },
                { icon: 'cloud_sync', text: 'Sync auf allen Geräten' },
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                  <span className="material-symbols-outlined text-primary text-xl">
                    {item.icon}
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleUpgrade}
              className="touch-btn w-full py-4 px-6 bg-primary text-white rounded-2xl font-bold elevation-2 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-xl">workspace_premium</span>
              Cookly Pro entdecken (€2,50/Monat)
            </button>

            <button
              onClick={onClose}
              className="touch-btn w-full py-4 px-6 text-text-secondary-light dark:text-text-secondary-dark hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl font-semibold transition-all"
            >
              Zum Free Tier zurückkehren
            </button>
          </div>

          <p className="mt-6 text-[10px] uppercase tracking-widest font-black text-text-secondary-light/40 dark:text-text-secondary-dark/40">
            Sichere Zahlung via Stripe
          </p>
        </div>
      </div>
    </div>
  );
}
