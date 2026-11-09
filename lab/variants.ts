import type React from 'react';
import type { Recipe } from '../types';
import RecipeV0 from './recipe/v0/RecipeV0';
import RecipeV1 from './recipe/v1/RecipeV1';

export type LabVariant = {
  id: string;
  title: string;
  /** Eine Zeile: Was ist an dieser Variante anders? */
  note: string;
  Component: React.FC<{ recipe: Recipe }>;
};

/** Neue Variante: Ordner von v1 kopieren, hier eintragen. Löschen: Ordner und Eintrag entfernen. */
export const RECIPE_VARIANTS: LabVariant[] = [
  { id: 'v0', title: 'Original', note: 'Wie die App heute. Nicht verändern.', Component: RecipeV0 },
  { id: 'v1', title: 'Arbeitsstand', note: 'Kopie von v0 (Stand 09.11.2026), hier bauen wir weiter.', Component: RecipeV1 },
];
