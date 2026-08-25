export type NativeBillingEnv = {
  VITE_NATIVE_BILLING_ENABLED?: string;
  VITE_NATIVE_BILLING_IOS_ENABLED?: string;
  VITE_REVENUECAT_GOOGLE_API_KEY?: string;
  VITE_REVENUECAT_APPLE_API_KEY?: string;
};

export type NativeBillingConfig = {
  enabled: boolean;
  apiKey?: string;
};

export function resolveNativeBilling(platform: string, env: NativeBillingEnv): NativeBillingConfig {
  if (platform === "android") {
    const apiKey = env.VITE_REVENUECAT_GOOGLE_API_KEY || undefined;
    return {
      enabled: env.VITE_NATIVE_BILLING_ENABLED === "true" && !!apiKey,
      apiKey,
    };
  }
  if (platform === "ios") {
    const apiKey = env.VITE_REVENUECAT_APPLE_API_KEY || undefined;
    return {
      enabled: env.VITE_NATIVE_BILLING_IOS_ENABLED === "true" && !!apiKey,
      apiKey,
    };
  }
  return { enabled: false };
}
