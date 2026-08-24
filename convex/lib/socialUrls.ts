/**
 * Reine URL-Logik für Instagram und Facebook — bewusst ohne Convex-Importe,
 * damit sie in `node --test` direkt geprüft werden kann. TikTok liegt wegen der
 * zusätzlichen Untertitel-Logik in `tiktokContent.ts`.
 */

// --- Instagram -------------------------------------------------------------

const INSTAGRAM_TRACKING_PARAMS = new Set([
  "igsh", "igshid", "utm_source", "utm_medium", "utm_campaign",
  "utm_term", "utm_content", "fbclid",
]);

export const isSupportedInstagramUrl = (rawUrl: string): boolean => {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (host !== "instagram.com" && !host.endsWith(".instagram.com")) return false;

    const path = parsed.pathname.toLowerCase();
    return path.includes("/p/") || path.includes("/reel/") || path.includes("/share/");
  } catch {
    return false;
  }
};

export const canonicalizeInstagramUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hostname = "www.instagram.com";

    for (const key of [...parsed.searchParams.keys()]) {
      if (INSTAGRAM_TRACKING_PARAMS.has(key) || key.startsWith("utm_")) parsed.searchParams.delete(key);
    }
    parsed.hash = "";

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && (parts[0] === "p" || parts[0] === "reel")) {
      parsed.pathname = `/${parts[0]}/${parts[1]}/`;
    } else {
      parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
      if (!parsed.pathname.endsWith("/")) parsed.pathname = `${parsed.pathname}/`;
    }

    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
};

export const extractInstagramShortCode = (url: string): string => {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && (parts[0] === "p" || parts[0] === "reel")) return parts[1];
  } catch {
    // Nicht-parsebare URLs liefern keinen Shortcode.
  }
  return "";
};

/** Die Instagram-App teilt `/share/`-Links, die erst nach einem Redirect auf den Post zeigen. */
export const needsInstagramRedirectResolution = (canonicalUrl: string): boolean => {
  try {
    return new URL(canonicalUrl).pathname.startsWith("/share/");
  } catch {
    return false;
  }
};

// --- Facebook --------------------------------------------------------------

const FACEBOOK_TRACKING_PARAMS = new Set([
  "fbclid", "__cft__", "__tn__", "refsrc", "ref",
  "mibextid", "_rdc", "_rdr", "sfnsn", "paipv",
]);
const FACEBOOK_PARAMS_TO_KEEP = new Set(["v", "id", "story_fbid"]);

export const isSupportedFacebookUrl = (rawUrl: string): boolean => {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host === "fb.watch" || host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
};

export const canonicalizeFacebookUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.hostname.toLowerCase() !== "fb.watch") parsed.hostname = "www.facebook.com";

    for (const key of [...parsed.searchParams.keys()]) {
      if (FACEBOOK_TRACKING_PARAMS.has(key) || !FACEBOOK_PARAMS_TO_KEEP.has(key)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = "";

    if (parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.replace(/\/+$/g, "") || "/";
    }

    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
};

export const isLikelyFacebookReelUrl = (canonicalUrl: string): boolean => {
  try {
    const parsed = new URL(canonicalUrl);
    const path = parsed.pathname.toLowerCase();
    return path.includes("/reel/") || path.includes("/share/r/") || parsed.hostname === "fb.watch";
  } catch {
    const lowered = canonicalUrl.toLowerCase();
    return lowered.includes("/reel/") || lowered.includes("/share/r/") || lowered.includes("fb.watch");
  }
};

/** Facebook-Beiträge haben keinen Shortcode — die längste Zahlenkette dient als Schlüssel. */
export const extractFacebookPostId = (url: string): string => {
  const matches = url.match(/\d{6,}/g);
  return matches ? [...matches].sort((a, b) => b.length - a.length)[0] : "";
};

export const needsFacebookRedirectResolution = (canonicalUrl: string): boolean => {
  try {
    const parsed = new URL(canonicalUrl);
    if (parsed.hostname === "fb.watch") return true;
    return parsed.pathname.startsWith("/share") || parsed.pathname.includes("/share/");
  } catch {
    return false;
  }
};
