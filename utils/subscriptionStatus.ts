type SubscriptionUser = {
  subscription?: string;
} | null | undefined;

export const getSubscriptionViewState = (currentUser: SubscriptionUser) => {
  const isLoadingUser = currentUser === undefined;
  const isPro = (currentUser?.subscription ?? "free") !== "free";

  return { isLoadingUser, isPro };
};
