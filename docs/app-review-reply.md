# App Review Reply – Guideline 2.1 Information Needed

Entwurf für die Antwort in App Store Connect und für das Feld „Notes“ unter App Review Information.
Platzhalter in [ECKIGEN KLAMMERN] vor dem Absenden ersetzen.

---

Hello App Review Team,

thank you for your feedback. Please find the requested information below.

**1. Screen recording**

A screen recording captured on a physical iPhone running iOS [VERSION] is attached / available here: [LINK]. It starts with launching the app and shows:

- Account registration (email and password), Sign in with Apple, login and logout
- Importing a recipe via the iOS share sheet (from Safari / Instagram / TikTok into Cookly)
- Importing a recipe from a photo (camera / photo library)
- Categories, weekly meal planner and shopping list
- The Cookly Pro paywall, purchasing a subscription (sandbox) and restoring purchases
- Account deletion (Profile → "Konto löschen")

Cookly has no user-generated content that is visible to other users. All recipes are private to the account that imported them, so no reporting or blocking mechanisms are required.

**2. Purpose and target audience**

Cookly is a personal recipe manager for home cooks. Users often save recipes from websites, Instagram, TikTok or cookbooks, and those recipes end up scattered across bookmarks, screenshots and saved posts. Cookly imports a recipe from a link, a shared post or a photo, extracts the ingredients and steps into a clean, structured format, and lets users organize recipes in categories, plan their week and generate a shopping list. The target audience is German-speaking adults who cook at home.

**3. How to access the main features**

- Demo account: [E-MAIL] / password: [PASSWORT]
- The demo account already contains sample recipes, categories and a weekly plan.
- Import via share sheet: open a recipe page in Safari (for example [BEISPIEL-URL]), tap Share and choose "Cookly".
- Import via link: tap "+" in the app and paste a recipe URL.
- Import via photo: tap "+", choose "Foto scannen" and take a photo of a printed recipe.
- Cookly Pro: the free plan has a limited number of imports. Tap "Pro" in the profile to open the paywall. Subscriptions are sold exclusively through Apple In-App Purchase on iOS.

**4. External services used**

- Convex – backend, database and authentication
- Sign in with Apple and Google Sign-In – optional login providers (email and password is also available)
- Google Gemini API – AI extraction of recipe data from web pages, social media posts and photos
- Apify and Jina Reader – fetching the content of a recipe link that the user shared
- Unsplash and Pollinations – placeholder images for recipes without a photo
- RevenueCat with Apple In-App Purchase – subscription management on iOS
- Brevo – [ZWECK PRÜFEN: E-Mail-Versand / Marketing]
- Sentry – crash reporting
- PostHog – product analytics

**5. Regional differences**

The app works the same way in all regions where it is available. The user interface is currently in German. Subscription prices follow the App Store price for each storefront.

**6. Regulated industry / third-party material**

Cookly does not operate in a regulated industry. Recipes are only imported when the user actively shares or enters a link, and they are stored privately for that user's personal use. The original source link is kept with each imported recipe. Cookly does not republish or distribute third-party content.

Best regards,
Nicolas Guerrero Tello
