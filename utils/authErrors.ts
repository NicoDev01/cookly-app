import { getUserErrorMessage } from './userErrors.ts';

export const getPasswordSignInErrorMessage = (error: unknown) =>
  getUserErrorMessage(error, 'auth-signin');
