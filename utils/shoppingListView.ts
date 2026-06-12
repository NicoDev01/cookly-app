export type ShoppingListViewItem = {
  _id: string;
  name: string;
  amount?: string;
  key: string;
  checked: boolean;
  createdAt: number;
  recipeId?: string;
  recipeTitle?: string;
};

export type ShoppingListGroup = {
  key: string;
  title: string;
  items: ShoppingListViewItem[];
};

type SupermarketSection = {
  key: string;
  title: string;
  keywords: string[];
};

const SUPERMARKET_SECTIONS: SupermarketSection[] = [
  {
    key: "produce",
    title: "Obst & Gemüse",
    keywords: [
      "apfel", "äpfel", "banane", "beere", "birne", "orange", "zitrone", "limette", "avocado",
      "tomate", "kartoffel", "zwiebel", "knoblauch", "salat", "gurke", "paprika", "karotte",
      "möhre", "zucchini", "aubergine", "pilz", "champignon", "spinat", "brokkoli", "ingwer",
      "obst", "gemüse", "kräuter", "basilikum", "petersilie", "koriander",
    ],
  },
  {
    key: "bakery",
    title: "Backwaren",
    keywords: ["brot", "brötchen", "baguette", "toast", "wrap", "tortilla", "ciabatta"],
  },
  {
    key: "meat-fish",
    title: "Fleisch & Fisch",
    keywords: [
      "hähnchen", "huhn", "pute", "rind", "schwein", "hack", "hackfleisch", "speck", "schinken",
      "salami", "lachs", "fisch", "thunfisch", "garnelen", "scampi",
    ],
  },
  {
    key: "dairy-eggs",
    title: "Molkerei & Eier",
    keywords: [
      "milch", "butter", "käse", "parmesan", "mozzarella", "feta", "joghurt", "yoghurt", "quark",
      "sahne", "creme fraiche", "crème fraîche", "schmand", "ei", "eier",
    ],
  },
  {
    key: "dry-goods",
    title: "Trockenvorrat",
    keywords: [
      "reis", "pasta", "nudel", "spaghetti", "penne", "linguine", "quinoa", "couscous", "bulgur",
      "linsen", "bohnen", "kichererbsen", "hafer", "müsli", "cornflakes",
    ],
  },
  {
    key: "cans-jars",
    title: "Konserven & Gläser",
    keywords: [
      "dose", "dosen", "passierte tomaten", "tomatenmark", "pesto", "olive", "oliven", "kapern",
      "mais", "glas", "brühe", "fond",
    ],
  },
  {
    key: "baking",
    title: "Backzutaten",
    keywords: ["mehl", "zucker", "backpulver", "hefe", "kakao", "schokolade", "vanille", "stärke"],
  },
  {
    key: "spices-oils",
    title: "Gewürze, Öl & Saucen",
    keywords: [
      "salz", "pfeffer", "paprika", "curry", "kümmel", "oregano", "thymian", "zimt", "öl",
      "olivenöl", "rapsöl", "essig", "sojasauce", "senf", "ketchup", "mayonnaise",
    ],
  },
  {
    key: "frozen",
    title: "Tiefkühl",
    keywords: ["tk", "tiefkühl", "gefroren", "frozen"],
  },
  {
    key: "drinks",
    title: "Getränke",
    keywords: ["wasser", "saft", "wein", "bier", "limonade", "cola", "kaffee", "tee"],
  },
  {
    key: "household",
    title: "Haushalt",
    keywords: ["papier", "serviette", "folie", "beutel", "reiniger", "spülmittel"],
  },
];

const normalizeShoppingText = (value: string) => value.toLowerCase().trim().replace(/\s+/g, " ");

export const buildShoppingItemKey = (name: string, _amount?: string, recipeId?: string) => {
  const baseKey = normalizeShoppingText(name);
  return recipeId ? `${baseKey}|recipe:${recipeId}` : baseKey;
};

export const buildLegacyShoppingItemKeys = (name: string, amount?: string, recipeId?: string) => {
  const normalizedName = normalizeShoppingText(name);
  const normalizedAmount = amount ? normalizeShoppingText(amount) : "";
  return [
    recipeId && normalizedAmount ? `${normalizedName}|${normalizedAmount}|recipe:${recipeId}` : undefined,
    `${normalizedName}|${normalizedAmount}`,
    normalizedName,
  ].filter((key): key is string => Boolean(key));
};

export const formatShoppingItemLabel = (item: Pick<ShoppingListViewItem, "name" | "amount">) => {
  const amount = item.amount?.trim();
  return amount ? `${amount} ${item.name}` : item.name;
};

const getSupermarketSectionIndex = (item: ShoppingListViewItem) => {
  const searchable = normalizeShoppingText(item.name);
  const index = SUPERMARKET_SECTIONS.findIndex((section) =>
    section.keywords.some((keyword) => searchable.includes(keyword))
  );
  return index === -1 ? SUPERMARKET_SECTIONS.length : index;
};

export const sortShoppingItemsForSupermarket = (items: ShoppingListViewItem[]) =>
  [...items].sort((a, b) => {
    const sectionDiff = getSupermarketSectionIndex(a) - getSupermarketSectionIndex(b);
    if (sectionDiff !== 0) return sectionDiff;
    return a.createdAt - b.createdAt;
  });

export const groupShoppingItemsByRecipe = (items: ShoppingListViewItem[]): ShoppingListGroup[] => {
  const groups = new Map<string, ShoppingListGroup>();

  for (const item of items) {
    const groupKey = item.recipeId ?? item.recipeTitle?.trim() ?? "without-recipe";
    const title = item.recipeTitle?.trim() || "";
    const existing = groups.get(groupKey);

    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(groupKey, { key: groupKey, title, items: [item] });
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.title && !b.title) return -1;
    if (!a.title && b.title) return 1;
    if (a.title && b.title) return a.title.localeCompare(b.title, "de");
    return a.items[0].createdAt - b.items[0].createdAt;
  });
};

export const groupShoppingItemsBySupermarketSection = (items: ShoppingListViewItem[]): ShoppingListGroup[] => {
  return [{
    key: "supermarket-route",
    title: "",
    items: sortShoppingItemsForSupermarket(items),
  }];
};
