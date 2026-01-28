export const SEED_DATA = [
  {
    id: '1',
    title: 'Cremige Tomaten-Ricotta-Pasta',
    category: 'Pasta',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAajk_b78uWu6uavPLqgPPwWRNyyqAHa492LB15npF2Kns_lYwVGe6eaSTRolWD8IDsCC1EDsy_Ot-V-M2ojMIboNGKPh6n84qljVDKgQs_g-8YHSC8WYPxSYMO4yJvIevqWlyQ_YR8dCISnA3bBOMFpYaarHpisP02J30jnlB5NlIH0WqBzu_-BQZFG-VGaN5ry05lDl6rtp3F6TZzSEWQNyM3gsmpW9puyjU6yufJ__ZWVqXag6ihNIsVwH61pJmgHWlAzZQG42o',
    imageAlt: 'Eine Schüssel cremiger Tomaten-Ricotta-Pasta, garniert mit frischem Basilikum',
    prepTimeMinutes: 30,
    difficulty: 'Einfach',
    portions: 4,
    isFavorite: false,
    ingredients: [
      { name: 'Pasta', amount: '400g' },
      { name: 'Ricotta', amount: '250g' },
      { name: 'Tomaten', amount: '1 Dose' },
      { name: 'Zwiebel', amount: '1' },
      { name: 'Knoblauchzehen', amount: '2' },
      { name: 'Basilikum', amount: 'Handvoll' }
    ],
    instructions: [
      { text: 'Pasta nach Packungsanweisung kochen.', icon: 'outdoor_grill' },
      { text: 'In der Zwischenzeit Zwiebel und Knoblauch in Olivenöl andünsten. Gehackte Tomaten hinzufügen und 10 Minuten köcheln lassen. Mit Salz und Pfeffer würzen.', icon: 'local_fire_department' },
      { text: 'Ricotta unter die Tomatensauce rühren, bis eine cremige Konsistenz entsteht. Nicht mehr kochen lassen.', icon: 'blender' },
      { text: 'Die gekochte Pasta abgießen und mit der Sauce vermengen. Mit frischem Basilikum garnieren und servieren.', icon: 'restaurant' }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: '2',
    title: 'Spaghetti Carbonara',
    category: 'Pasta',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDv3u4gWFY5QOqxtek_ujjcXQV3jRJXDWu4CTD_G4oVKBm6JOSbljCQ8loWQPAAUZJgqYgKoMCmTOVJAHy9xFoB6UtF9YEpRGSbrJHkM4-2fNzeE0nYjmbWxBU_JywzkC6BuGO1wf-ROovH3TByrUkX8dXidmLHNjWFyt0_W-PIlyofJkHnjFobp2l3Bh78iiHci6vDz1hAKW3D0b-klfue-xeH8SRwJEtoA5hmTwrqVgKZKzeyqQxb4iXmjmWv3sPwxjc13N80gQo',
    imageAlt: 'Spaghetti Carbonara in a white bowl',
    prepTimeMinutes: 20,
    difficulty: 'Mittel',
    portions: 2,
    isFavorite: true,
    ingredients: [
      { name: 'Spaghetti', amount: '250g' },
      { name: 'Guanciale', amount: '100g' },
      { name: 'Eigelb', amount: '3' },
      { name: 'Pecorino Romano', amount: '50g' }
    ],
    instructions: [
      { text: 'Pasta kochen. Speck anbraten.', icon: 'outdoor_grill' },
      { text: 'Eier und Käse mischen.', icon: 'blender' },
      { text: 'Alles vermengen.', icon: 'restaurant' }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: '3',
    title: 'Basilikum-Pesto Genovese',
    category: 'Pasta',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuApCQlto-Cf2vPyZ6l5aUSxh9QY6N73hszqsr6Y3riR4pD93S3H_wpItusJyVSEOWLkgizh1BrpO0wCIjlqOXmm0i5taoGc01JjOa9KD_8U6wGRhY9UiQMEripN76US1E4Rx0bMzyNsnuxSfvAIvTAfpdFr7WjKrzDqJqhIcF7sOq-XFBXIwr1l5jMK4BLjxZkJ3ZAa0g_RUT-VDZLJI0-oLy3DxYKRba7TDcMhzYBJ9AIsdyEGR0zvRTaH_HA9PaSUAcrVLtrS7us',
    imageAlt: 'Pesto pasta with cherry tomatoes',
    prepTimeMinutes: 15,
    difficulty: 'Einfach',
    portions: 4,
    isFavorite: false,
    ingredients: [
      { name: 'Basilikum', amount: '2 Bund' },
      { name: 'Pinienkerne', amount: '50g' },
      { name: 'Parmesan', amount: '50g' },
      { name: 'Olivenöl', amount: '100ml' }
    ],
    instructions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: '4',
    title: 'Klassische Lasagne',
    category: 'Pasta',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDjE5Kw-cvf9FyH8g_tk4AXiGmFse8K0lr2GTz034fcsuAjHyY8zYaaeEwe_aov_BPqB3PabQ6eqj7hBF42iS5PbiytfvPQpcR1befztdyUiQOKhAxoxMu0IAoTk2yvhiVE7h_7THVo_RFDPuNze8N8pNfC8RyFMZYdjyBRLvmg2qxPzYdkERhKodu_xZD-lwb7D6XZ6mgtg34x4pjak7niVt5S6lZ9hD2uGisnqugIhVKn-gH6EabKZac8Stz8CG-aMgMNRUFPKxY',
    imageAlt: 'Lasagne slice on a plate',
    prepTimeMinutes: 90,
    difficulty: 'Schwer',
    portions: 6,
    isFavorite: true,
    ingredients: [],
    instructions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];