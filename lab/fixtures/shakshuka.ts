import type { Id } from '../../convex/_generated/dataModel';
import type { Recipe } from '../../types';
import shakshukaImage from '../assets/shakshuka.webp';

/** Feste Testdaten fürs Labor: kein Login, keine Datenbank. Inhalt wie im App-Store-Screenshot. */
export const shakshuka: Recipe = {
  _id: 'lab_shakshuka' as Id<'recipes'>,
  _creationTime: 0,
  title: 'Shakshuka',
  category: 'Frühstück',
  image: shakshukaImage,
  sourceUrl: 'https://www.instagram.com/',
  prepTimeMinutes: 30,
  difficulty: 'Einfach',
  portions: 2,
  isFavorite: true,
  ingredients: [
    { amount: '4', name: 'Eier' },
    { amount: '1 Dose', name: 'Gehackte Tomaten' },
    { amount: '1', name: 'Rote Paprika' },
    { amount: '1', name: 'Zwiebel' },
    { amount: '2', name: 'Knoblauchzehen' },
    { amount: '1 TL', name: 'Kreuzkümmel' },
    { amount: '1 TL', name: 'Paprikapulver, edelsüß' },
    { amount: '1 Handvoll', name: 'Petersilie' },
  ],
  instructions: [
    { text: 'Zwiebel und Paprika würfeln und in Olivenöl weich dünsten.' },
    { text: 'Knoblauch, Kreuzkümmel und Paprikapulver kurz mitrösten.' },
    { text: 'Tomaten dazugeben und 10 Minuten einköcheln lassen.' },
    { text: 'Vier Mulden formen, Eier hineingleiten lassen und zugedeckt 6–8 Minuten stocken lassen.' },
    { text: 'Mit Petersilie bestreuen und mit frischem Brot servieren.' },
  ],
};
