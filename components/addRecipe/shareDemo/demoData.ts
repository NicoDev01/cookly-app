import type { Id } from '../../../convex/_generated/dataModel';
import type { Recipe } from '../../../types';

/** Feste Inhalte der Teilen-Anleitung: ein Beispielbeitrag und das Rezept, das Cookly daraus macht. */
export const DEMO_IMAGE = '/add-recipe/demo-shakshuka.webp';

export const DEMO_POST = {
  author: 'kochenmitlea',
  image: DEMO_IMAGE,
  caption: 'Shakshuka in 30 Minuten 🍳 Eier, Tomaten, Paprika, Feta. Rezept unten 👇',
};

export const DEMO_RECIPE: Recipe = {
  _id: 'demo_shakshuka' as Id<'recipes'>,
  _creationTime: 0,
  isFavorite: false,
  title: 'Shakshuka',
  category: 'Frühstück',
  image: DEMO_IMAGE,
  prepTimeMinutes: 30,
  difficulty: 'Einfach',
  portions: 2,
  ingredients: [
    { amount: '4', name: 'Eier' },
    { amount: '1 Dose', name: 'Gehackte Tomaten' },
    { amount: '1', name: 'Rote Paprika' },
    { amount: '1', name: 'Zwiebel' },
    { amount: '2', name: 'Knoblauchzehen' },
    { amount: '1 TL', name: 'Kreuzkümmel' },
    { amount: '1 TL', name: 'Paprikapulver, edelsüß' },
    { amount: '1 Handvoll', name: 'Petersilie' },
    { amount: '100 g', name: 'Feta' },
  ],
  instructions: [
    { text: 'Zwiebel und Paprika würfeln und in Olivenöl weich dünsten.' },
    { text: 'Knoblauch, Kreuzkümmel und Paprikapulver kurz mitrösten.' },
    { text: 'Tomaten dazugeben und 10 Minuten einköcheln lassen.' },
    { text: 'Vier Mulden formen, Eier hineingleiten lassen und zugedeckt 6–8 Minuten stocken lassen.' },
    { text: 'Mit Petersilie bestreuen und mit frischem Brot servieren.' },
  ],
};
