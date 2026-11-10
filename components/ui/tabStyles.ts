/** Gemeinsame Klassen der überarbeiteten Tabs (Einkaufsliste, Favoriten), damit sie gleich aussehen. */
export const iconButton =
  'flex h-10 w-10 items-center justify-center rounded-full bg-card-light text-text-primary-light shadow-neo-light-convex transition active:scale-95 disabled:opacity-40 dark:bg-card-dark dark:text-text-primary-dark dark:shadow-neo-dark-convex';
export const sheetButton =
  'flex items-center gap-3 rounded-2xl px-2 py-3 text-left text-[15px] font-semibold text-text-primary-light active:bg-black/5 disabled:opacity-40 dark:text-text-primary-dark dark:active:bg-white/10';
/** Eingabefeld wie die Suche auf der Kategorienseite: erhaben, beim Tippen grün umrandet. Erwartet links `pl-4` und ein `inputIcon`. */
export const inputShell =
  'group flex h-12 items-center gap-2 rounded-xl bg-card-light pr-1.5 shadow-neo-light-convex transition-all duration-200 focus-within:bg-primary/10 focus-within:shadow-none focus-within:ring-2 focus-within:ring-primary dark:bg-card-dark dark:shadow-neo-dark-convex';
export const inputIcon =
  'material-symbols-outlined text-text-secondary-light transition-colors group-focus-within:text-primary dark:text-text-secondary-dark';
/** 16 px Schrift: Darunter zoomt iOS beim Antippen in die Seite, und die ganze App lässt sich verschieben. */
export const inputClass =
  'h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-base text-black outline-none placeholder:text-text-secondary-light focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-text-secondary-dark';
