/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NATIVE_BILLING_ENABLED?: string;
  readonly VITE_NATIVE_BILLING_IOS_ENABLED?: string;
  readonly VITE_REVENUECAT_GOOGLE_API_KEY?: string;
  readonly VITE_REVENUECAT_APPLE_API_KEY?: string;
}
