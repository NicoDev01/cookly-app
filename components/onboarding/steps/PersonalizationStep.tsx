import React, { useState } from 'react';

interface PersonalizationStepProps {
  onNext: (data: { cookingFrequency: string; preferredCuisines: string[] }) => void;
}

export const PersonalizationStep: React.FC<PersonalizationStepProps> = ({ onNext }) => {
  const [cookingFrequency, setCookingFrequency] = useState<string>('regular');
  const [preferredCuisines, setPreferredCuisines] = useState<string[]>([]);

  const cuisines = [
    'italienisch',
    'asiatisch',
    'deutsch',
    'vegan',
    'vegetarisch',
    'mediterran',
  ];

  const toggleCuisine = (cuisine: string) => {
    setPreferredCuisines((prev) =>
      prev.includes(cuisine)
        ? prev.filter((c) => c !== cuisine)
        : [...prev, cuisine]
    );
  };

  const handleNext = () => {
    onNext({ cookingFrequency, preferredCuisines });
  };

  return (
    <div className="flex flex-col items-center justify-center px-4 py-6">
      <h2 className="text-3xl font-bold tracking-tight mb-6">
        Personalisiere dein <span className="text-primary italic">Erlebnis</span>
      </h2>

      <div className="mb-6 w-full max-w-md">
        <h3 className="font-semibold mb-3">Wie oft kochst du?</h3>
        <div className="space-y-2">
          {['rare', 'regular', 'daily'].map((freq) => (
            <button
              key={freq}
              onClick={() => setCookingFrequency(freq)}
              className={`w-full p-4 rounded-full border-2 transition active:scale-[0.98] duration-150 select-none ${
                cookingFrequency === freq
                  ? 'border-primary bg-primary/5'
                  : 'border-primary/20 active:border-primary/40'
              }`}
            >
              {freq === 'rare' && 'Selten'}
              {freq === 'regular' && 'Regelmäßig'}
              {freq === 'daily' && 'Täglich'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8 w-full max-w-md">
        <h3 className="font-semibold mb-3">Welche Küchen magst du?</h3>
        <div className="flex flex-wrap gap-2">
          {cuisines.map((cuisine) => (
            <button
              key={cuisine}
              onClick={() => toggleCuisine(cuisine)}
              className={`px-4 py-2 rounded-full border-2 transition active:scale-[0.98] duration-150 select-none capitalize ${
                preferredCuisines.includes(cuisine)
                  ? 'border-primary bg-primary/5'
                  : 'border-primary/20 active:border-primary/40'
              }`}
            >
              {cuisine}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleNext}
        className="w-full h-14 text-lg font-bold bg-primary active:bg-primary/80 text-primary-foreground shadow-lg shadow-primary/20 rounded-full active:scale-[0.98] transition-transform duration-150 select-none"
      >
        Los geht's!
      </button>
    </div>
  );
};
