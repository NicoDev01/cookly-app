import { Capacitor } from "@capacitor/core";

export function externalPaymentBrandingAllowed(isNativePlatform: boolean): boolean {
  return !isNativePlatform;
}

export const showsExternalPaymentBranding = externalPaymentBrandingAllowed(Capacitor.isNativePlatform());
