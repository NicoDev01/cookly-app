import test from 'node:test';
import assert from 'node:assert/strict';

import { getSubscriptionViewState } from './subscriptionStatus.ts';

test('subscription view stays loading while current user is unresolved', () => {
  assert.deepEqual(getSubscriptionViewState(undefined), {
    isLoadingUser: true,
    isPro: false,
  });
});

test('subscription view treats missing subscription as free', () => {
  assert.deepEqual(getSubscriptionViewState({}), {
    isLoadingUser: false,
    isPro: false,
  });
});

test('subscription view treats explicit pro subscriptions as pro', () => {
  assert.deepEqual(getSubscriptionViewState({ subscription: 'pro_monthly' }), {
    isLoadingUser: false,
    isPro: true,
  });
});
