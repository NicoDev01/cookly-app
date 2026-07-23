import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";

export type PlanId = "pro_monthly" | "pro_yearly";

type WebActions = {
  checkout: (args: { planId: PlanId; successUrl: string; cancelUrl: string }) => Promise<{ checkoutUrl?: string | null }>;
  portal: (args: { returnUrl: string }) => Promise<{ portalUrl?: string | null }>;
};

const android = Capacitor.getPlatform() === "android";
const nativeEnabled = android && import.meta.env.VITE_NATIVE_BILLING_ENABLED === "true" && !!import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY;
let configuredUserId: string | undefined;

async function nativePurchases(billingUserId: string) {
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  if (!configuredUserId) {
    await Purchases.configure({ apiKey: import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY, appUserID: billingUserId });
  } else if (configuredUserId !== billingUserId) {
    await Purchases.logIn({ appUserID: billingUserId });
  }
  configuredUserId = billingUserId;
  return Purchases;
}

async function nativePackage(planId: PlanId, billingUserId: string): Promise<PurchasesPackage> {
  const Purchases = await nativePurchases(billingUserId);
  const offering = (await Purchases.getOfferings()).current;
  const selected = planId === "pro_yearly" ? offering?.annual : offering?.monthly;
  if (!selected) throw new Error("NATIVE_BILLING_PRODUCT_UNAVAILABLE");
  return selected;
}

export function createBillingClient(billingUserId: string | undefined, web: WebActions) {
  const native = Capacitor.isNativePlatform();
  const requireBillingUserId = () => {
    if (!nativeEnabled) throw new Error("NATIVE_BILLING_NOT_CONFIGURED");
    if (!billingUserId) throw new Error("BILLING_USER_NOT_READY");
    return billingUserId;
  };

  return {
    provider: native ? "store" as const : "stripe" as const,
    available: !native || nativeEnabled,
    canRestore: nativeEnabled,
    async prices() {
      if (!nativeEnabled || !billingUserId) return null;
      const monthly = await nativePackage("pro_monthly", billingUserId);
      const yearly = await nativePackage("pro_yearly", billingUserId);
      return {
        pro_monthly: monthly.product.priceString,
        pro_yearly: yearly.product.priceString,
      };
    },
    async purchase(planId: PlanId) {
      if (!native) {
        const baseUrl = window.location.origin;
        const result = await web.checkout({
          planId,
          successUrl: `${baseUrl}/#/profile?success=true`,
          cancelUrl: `${baseUrl}/#/subscribe?canceled=true`,
        });
        return { redirectUrl: result.checkoutUrl ?? undefined, active: false };
      }

      const userId = requireBillingUserId();
      const Purchases = await nativePurchases(userId);
      const result = await Purchases.purchasePackage({ aPackage: await nativePackage(planId, userId) });
      return { active: !!result.customerInfo.entitlements.active.pro };
    },
    async manage() {
      if (!native) {
        const result = await web.portal({ returnUrl: `${window.location.origin}/#/profile` });
        return result.portalUrl ?? undefined;
      }

      const Purchases = await nativePurchases(requireBillingUserId());
      const { customerInfo } = await Purchases.getCustomerInfo();
      if (!customerInfo.managementURL) throw new Error("STORE_SUBSCRIPTION_NOT_FOUND");
      await Browser.open({ url: customerInfo.managementURL });
    },
    async restore() {
      const Purchases = await nativePurchases(requireBillingUserId());
      const { customerInfo } = await Purchases.restorePurchases();
      return !!customerInfo.entitlements.active.pro;
    },
  };
}
