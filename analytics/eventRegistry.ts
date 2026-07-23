export const EVENT_NAMES = [
  "landing_viewed", "app_installed", "app_first_open", "app_opened",
  "signup_viewed", "signup_started", "signup_method_selected", "signup_submitted",
  "verification_sent", "verification_completed", "signup_completed",
  "signin_started", "signin_succeeded", "signin_failed",
  "password_reset_started", "password_reset_completed", "logout",
  "onboarding_started", "onboarding_step_viewed", "onboarding_goal_selected",
  "onboarding_completed", "onboarding_abandoned", "first_action_prompted", "first_action_started",
  "screen_viewed", "screen_left", "navigation_used", "tab_selected",
  "modal_opened", "modal_closed", "empty_state_viewed", "cta_clicked",
  "search_used", "filter_applied", "sort_changed", "back_navigation", "external_link_opened",
  "recipe_create_started", "recipe_saved", "recipe_create_failed", "recipe_opened",
  "recipe_reopened", "recipe_edited", "recipe_deleted", "recipe_shared",
  "favorite_added", "favorite_removed", "category_assigned",
  "ingredient_checked", "instruction_completed",
  "import_started", "import_source_detected", "import_metadata_started",
  "import_metadata_completed", "import_ai_started", "import_ai_completed",
  "import_image_started", "import_image_completed", "import_recipe_saved",
  "import_succeeded", "import_failed", "import_cancelled", "import_retry_started",
  "weekly_plan_viewed", "weekly_meal_added", "weekly_meal_removed",
  "shopping_list_viewed", "shopping_item_added", "shopping_item_checked", "shopping_item_removed",
  "notification_permission_requested", "notification_permission_result",
  "local_notification_scheduled", "local_notification_received",
  "push_scheduled", "push_sent", "push_received", "push_opened",
  "push_dismissed", "push_failed", "push_converted",
  "screen_load_completed", "screen_load_slow", "image_load_completed",
  "image_load_failed", "convex_request_failed", "network_offline",
  "network_restored", "app_error_recovered",
  "synthetic_health_check",
  "campaign_eligible", "campaign_impression", "campaign_clicked",
  "campaign_dismissed", "campaign_converted", "campaign_frequency_capped",
  "experiment_exposed", "paywall_viewed", "checkout_started",
  "purchase_completed", "subscription_cancelled",
  "ad_request", "ad_loaded", "ad_impression", "ad_clicked",
  "ad_failed", "ad_reward_granted", "ad_revenue",
] as const;

export type EventName = typeof EVENT_NAMES[number];
export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export const ALLOWED_EVENT_PROPERTIES = [
  "timestamp", "billingUserId", "anonymousId", "sessionId", "correlationId",
  "operationId", "campaignId", "experimentId", "platform", "appVersion",
  "buildNumber", "screen", "previousScreen", "nextScreen", "onboardingGoal",
  "plan", "subscriptionStatus", "acquisitionSource", "acquisitionCampaign",
  "experimentVariants", "eventVersion", "method", "step", "result", "element",
  "durationMs", "scrollDepth", "resultCount", "entryPoint", "recipeId", "source",
  "category", "normalizedTags", "difficulty", "hasImage", "ingredientCount",
  "instructionCount", "prepTimeBucket", "recipeAgeDays", "provider",
  "sourcePlatform", "stage", "errorCode", "retryCount", "hasThumbnail",
  "captionLengthBucket", "recipeCreated", "cacheHit", "networkType", "operation",
  "feature", "current", "limit", "success", "variant", "placement", "channel",
  "scope", "expected",
] as const;

export const EVENT_REGISTRY = Object.fromEntries(
  EVENT_NAMES.map((name) => [name, {
    name,
    version: 1,
    purpose: name.replaceAll("_", " "),
    question: `Wie häufig tritt ${name} auf?`,
    source: "client" as const,
    allowedProperties: ALLOWED_EVENT_PROPERTIES,
    expectedFrequency: "journey-dependent",
    deduplication: "eventId",
    dashboardMetric: name,
  }]),
) as Record<EventName, {
  name: EventName;
  version: 1;
  purpose: string;
  question: string;
  source: "client";
  allowedProperties: typeof ALLOWED_EVENT_PROPERTIES;
  expectedFrequency: "journey-dependent";
  deduplication: "eventId";
  dashboardMetric: EventName;
}>;
