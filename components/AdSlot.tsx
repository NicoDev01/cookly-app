import { useEffect } from "react";

import {
  disabledAdProvider,
  type AdPlacement,
} from "../services/ads";
import { featureFlag } from "../services/analytics";

export const AdSlot = ({ placement }: { placement: AdPlacement }) => {
  const enabled = featureFlag("ad_placement_enabled", false);

  useEffect(() => {
    if (!enabled) return;
    void disabledAdProvider.initialize().then(() => disabledAdProvider.load(placement));
  }, [enabled, placement]);

  return null;
};
