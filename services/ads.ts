export type AdPlacement =
  | "home_feed"
  | "category_feed"
  | "recipe_detail_bottom"
  | "post_import"
  | "rewarded_extra_import";

export type AdResult = { shown: boolean; rewarded?: boolean; revenue?: number };

export interface AdProvider {
  initialize(): Promise<void>;
  load(placement: AdPlacement): Promise<void>;
  show(placement: AdPlacement): Promise<AdResult>;
}

export const disabledAdProvider: AdProvider = {
  initialize: async () => undefined,
  load: async () => undefined,
  show: async () => ({ shown: false }),
};
