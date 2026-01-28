export const MATERIAL_SYMBOLS_ALLOWLIST = new Set<string>([
  // Keep this list intentionally small and only include icons we know are available
  // in the loaded "Material Symbols Outlined" font.
  'circle',
  'restaurant',
  'timer',
  'water_drop',
  'local_fire_department',
  'outdoor_grill',
  'blender',
  'microwave',
  'oven_gen',
  'skillet',
  'grid_on',
  'cookie',
  'cake',
  'local_pizza',
  'set_meal',
  'soup_kitchen',
  'flatware',
  'egg',
  'breakfast_dining',
  'brunch_dining',
  'lunch_dining',
  'dinner_dining',
  'ramen_dining',
  'bakery_dining',
  'kitchen',
]);

export const sanitizeMaterialSymbolName = (value?: string | null): string | undefined => {
  const cleaned = (value ?? '').trim();
  if (!cleaned) return undefined;

  // normalize common variants
  const normalized = cleaned
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_');

  if (!MATERIAL_SYMBOLS_ALLOWLIST.has(normalized)) return undefined;
  return normalized;
};

export const sanitizeInstructionsIcons = <T extends { icon?: string | null }>(
  instructions: T[]
): T[] => {
  return instructions.map((step) => {
    const icon = sanitizeMaterialSymbolName(step.icon);
    return { ...step, icon };
  });
};
