import { Id } from "./convex/_generated/dataModel";

export interface Ingredient {
  name: string;
  amount?: string;
}

export interface Instruction {
  text: string;
  icon?: string;
}

export interface Recipe {
  _id: Id<"recipes">; // Convex ID ist immer _id
  _creationTime: number; // Convex System Field
  
  title: string;
  category: string;
  image?: string;
  imageStorageId?: Id<"_storage">;
  imageBlurhash?: string;
  imageAlt?: string;
  sourceImageUrl?: string; // URL zum abfotografierten Original
  sourceUrl?: string; // URL zum Original-Post (z.B. Instagram)
  prepTimeMinutes: number;
  difficulty: 'Einfach' | 'Mittel' | 'Schwer';
  portions: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  isFavorite: boolean;
}

export type Category = string;