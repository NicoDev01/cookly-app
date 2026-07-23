const ALLOWED_MATERIAL_ICONS = new Set([
  "outdoor_grill", "timer", "restaurant", "blender", "oven_gen", "skillet",
  "cookie", "local_pizza", "set_meal", "soup_kitchen", "flatware", "egg",
  "kitchen", "microwave",
]);

export const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? value as Record<string, unknown> : null;

export const isHttpUrl = (value: string): boolean =>
  value.startsWith("https://") || value.startsWith("http://");

export const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

export const getNestedValue = (obj: unknown, path: string): unknown => {
  let current: unknown = obj;
  for (const part of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    const match = part.match(/^(\w+)\[(\d+)\]$/);
    const record = toRecord(current);
    if (!record) return undefined;
    if (!match) {
      current = record[part];
      continue;
    }
    const value = record[match[1]];
    const index = Number(match[2]);
    if (!Array.isArray(value) || index >= value.length) return undefined;
    current = value[index];
  }
  return current;
};

export const uniqueNonEmpty = (values: string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const inferInstructionIcon = (text: string): string => {
  const lower = text.toLowerCase();
  if (/(ofen|vorheizen|backen|bake|roast)/.test(lower)) return "oven_gen";
  if (/(anbraten|braten|fry|saute|pfanne)/.test(lower)) return "skillet";
  if (/(grill|grillen|bbq)/.test(lower)) return "outdoor_grill";
  if (/(mix|mixen|rühren|verrühren|blenden|pürieren)/.test(lower)) return "blender";
  if (/(kochen|köcheln|simmer|suppe|eintopf)/.test(lower)) return "soup_kitchen";
  if (/(schneiden|hacken|würfeln|slice|chop|julienne)/.test(lower)) return "kitchen";
  if (/(ruhen|ziehen lassen|minuten|sekunden|timer|warten)/.test(lower)) return "timer";
  if (/(servieren|anrichten|garnieren|serve)/.test(lower)) return "flatware";
  if (/(mikrowelle|microwave)/.test(lower)) return "microwave";
  if (/(ei|eier|egg)/.test(lower)) return "egg";
  if (/(keks|cookie|teig|dessert|kuchen)/.test(lower)) return "cookie";
  if (/pizza/.test(lower)) return "local_pizza";
  if (/(portionieren|aufteilen)/.test(lower)) return "set_meal";
  return "restaurant";
};

export const normalizeInstructionIcon = (value: unknown, text: string): string => {
  const icon = typeof value === "string" ? value.trim() : "";
  return ALLOWED_MATERIAL_ICONS.has(icon) ? icon : inferInstructionIcon(text);
};
