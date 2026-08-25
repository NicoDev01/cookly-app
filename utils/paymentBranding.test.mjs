import test from "node:test";
import assert from "node:assert/strict";
import { externalPaymentBrandingAllowed } from "./paymentBranding.ts";

test("external payment branding is only allowed outside native platforms", () => {
  assert.equal(externalPaymentBrandingAllowed(false), true);
  assert.equal(externalPaymentBrandingAllowed(true), false);
});
