export type ToastTone = 'success' | 'error' | 'info';

export type ToastState = {
  visible: boolean;
  recipeId: string | null;
  message: string;
  title: string;
  tone: ToastTone;
};

const getToastTitle = (tone: ToastTone, recipeId?: string | null) => {
  if (recipeId) return 'Rezept importiert';
  if (tone === 'success') return 'Erfolg';
  if (tone === 'error') return 'Fehler';
  return 'Hinweis';
};

export const createToastState = (
  message: string,
  tone: ToastTone = 'info',
  recipeId: string | null = null,
): ToastState => ({
  visible: true,
  recipeId,
  message,
  title: getToastTitle(tone, recipeId),
  tone,
});

export const hiddenToastState: ToastState = {
  visible: false,
  recipeId: null,
  message: '',
  title: '',
  tone: 'info',
};
