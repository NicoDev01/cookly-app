import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { useLocation, useNavigate } from "react-router-dom";

import { api } from "../convex/_generated/api";
import { capture } from "../services/analytics";

const placementFor = (path: string) => {
  if (path.includes("/recipe/")) return "recipe_detail";
  if (path.includes("/weekly")) return "weekly_planner";
  if (path.includes("/shopping")) return "shopping_list";
  if (path.includes("/profile")) return "profile";
  return "categories_top";
};

export const InAppCampaign = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const placement = placementFor(location.pathname);
  const campaign = useQuery(api.marketing.activeCampaign, { placement });
  const record = useMutation(api.marketing.recordDelivery);
  const shown = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!campaign || shown.current === campaign._id) return;
    shown.current = campaign._id;
    capture("campaign_eligible", { campaignId: campaign._id, placement });
    capture("campaign_impression", { campaignId: campaign._id, placement });
    void record({ campaignId: campaign._id, event: "impression" });
  }, [campaign, placement, record]);

  if (!campaign) return null;
  const dismiss = () => {
    capture("campaign_dismissed", { campaignId: campaign._id, placement });
    void record({ campaignId: campaign._id, event: "dismissed" });
  };
  const click = () => {
    capture("campaign_clicked", { campaignId: campaign._id, placement });
    void record({ campaignId: campaign._id, event: "clicked" });
    if (campaign.ctaDeepLink) navigate(campaign.ctaDeepLink);
  };

  return (
    <aside className="mx-4 mt-safe rounded-2xl bg-primary/10 border border-primary/20 p-4 flex gap-3 items-center">
      <div className="min-w-0 flex-1">
        <strong className="block text-sm">{campaign.title}</strong>
        <p className="text-sm text-muted-foreground">{campaign.body}</p>
      </div>
      {campaign.ctaLabel && (
        <button onClick={click} className="shrink-0 rounded-full bg-primary text-white px-4 py-2 text-sm font-semibold">
          {campaign.ctaLabel}
        </button>
      )}
      <button onClick={dismiss} aria-label="Kampagne schließen" className="p-2 text-muted-foreground">×</button>
    </aside>
  );
};
