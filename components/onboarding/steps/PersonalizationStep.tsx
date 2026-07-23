import React, { useState } from "react";

interface PersonalizationStepProps {
  onNext: (data: { name: string; onboardingGoal: string }) => void;
}

const goals = [
  ["collect", "Rezepte an einem Ort sammeln"],
  ["plan", "Meine Woche besser planen"],
  ["discover", "Neue Gerichte ausprobieren"],
] as const;

export const PersonalizationStep: React.FC<PersonalizationStepProps> = ({ onNext }) => {
  const [name, setName] = useState("");
  const [onboardingGoal, setOnboardingGoal] = useState("collect");

  return (
    <div className="flex flex-col items-center justify-center px-4 py-6">
      <h2 className="text-3xl font-bold tracking-tight mb-6">
        Mach Cookly zu <span className="text-primary italic">deiner App</span>
      </h2>

      <div className="mb-6 w-full max-w-md">
        <h3 className="font-semibold mb-3">Wie heißt du?</h3>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Dein Name"
          autoComplete="name"
          className="w-full p-4 rounded-full border-2 border-primary/20 bg-transparent text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition"
        />
      </div>

      <div className="mb-8 w-full max-w-md">
        <h3 className="font-semibold mb-3">Was möchtest du hauptsächlich erreichen?</h3>
        <div className="space-y-2">
          {goals.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setOnboardingGoal(value)}
              className={`w-full p-4 rounded-full border-2 transition active:scale-[0.98] ${
                onboardingGoal === value ? "border-primary bg-primary/5" : "border-primary/20"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => onNext({ name: name.trim(), onboardingGoal })}
        className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 rounded-full active:scale-[0.98] transition-transform"
      >
        Los geht&apos;s!
      </button>
    </div>
  );
};
