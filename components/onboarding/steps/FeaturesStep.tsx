import React, { useState } from 'react';
import { FileText, Instagram, Camera, Calendar, ChevronDown, ChevronUp, ChefHat, Globe, Sparkles, ShoppingCart } from 'lucide-react';

interface FeaturesStepProps {
  onNext: () => void;
}

export const FeaturesStep: React.FC<FeaturesStepProps> = ({ onNext }) => {
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  const toggleFeature = (featureId: string) => {
    setExpandedFeature(expandedFeature === featureId ? null : featureId);
  };

  const features = [
    {
      id: 'recipes',
      icon: ChefHat,
      title: 'Rezepte erstellen & verwalten',
      description: 'Erstelle deine eigenen Rezepte, füge Zutaten und Anweisungen hinzu und organisiere sie in Kategorien. Alle deine Rezepte an einem Ort.',
    },
    {
      id: 'instagram',
      icon: Globe,
      title: 'Instagram, Facebook & Website Import',
      description: 'Importiere Rezepte direkt von Instagram, Facebook oder anderen Websites. Einfach den Link kopieren und Cookly übernimmt den Rest.',
    },
    {
      id: 'ai-scan',
      icon: Sparkles,
      title: 'KI Foto-Scan',
      description: 'Mache ein Foto von einem Rezept aus einem Kochbuch oder Magazin. Unsere KI erkennt automatisch Zutaten und Anweisungen.',
    },
    {
      id: 'planner',
      icon: ShoppingCart,
      title: 'Wochenplaner & Einkaufsliste',
      description: 'Plane deine Mahlzeiten für die ganze Woche und generiere automatisch eine Einkaufsliste mit allen benötigten Zutaten.',
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center px-4 py-6">
      <h2 className="text-3xl font-bold tracking-tight mb-6">
        Die Cookly <span className="text-primary italic">Features:</span>
      </h2>
      <div className="flex flex-col gap-4 mb-8 w-full max-w-md">
        {features.map((feature) => {
          const isExpanded = expandedFeature === feature.id;
          return (
            <div
              key={feature.id}
              className={`bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border-2 border-primary/10 overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'shadow-xl border-primary/20' : ''}`}
            >
              <button
                onClick={() => toggleFeature(feature.id)}
                className="flex items-center gap-4 w-full px-5 py-5 min-h-[72px] text-left active:scale-[0.98] active:bg-muted/50 transition-all duration-200 select-none"
              >
                <div className="p-3 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/20 shadow-inner">
                  <feature.icon className="w-7 h-7 text-primary" strokeWidth={2} />
                </div>
                <h1 className="flex-1 font-semibold text-lg tracking-tight">{feature.title}</h1>
                <div className={`p-1.5 rounded-full transition-all duration-300 ${isExpanded ? 'bg-primary/10 rotate-180' : 'bg-muted/50'}`}>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-primary" strokeWidth={2.5} />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" strokeWidth={2.5} />
                  )}
                </div>
              </button>
              <div 
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}
              >
                <div className="px-5 pb-5 pt-0">
                  <p className="text-sm text-muted-foreground leading-relaxed pl-[68px]">
                    {feature.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button
        onClick={onNext}
        className="w-full h-14 text-lg font-bold bg-gradient-to-r from-primary to-primary/90 active:from-primary/90 active:to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 rounded-full active:scale-[0.98] transition-all duration-200 select-none"
      >
        Weiter
      </button>
    </div>
  );
};
