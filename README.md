# 🍳 Cookly

AI-powered Recipe SaaS App with multi-user support.

Save recipes from anywhere – snap a photo, paste a URL, or add manually. Cookly uses Google Gemini AI to extract and structure recipes automatically from images and web pages.

## Features

- 🤖 **AI Recipe Scanner** - Scan recipes from photos using Google Gemini
- 🌐 **URL Import** - Save recipes from any website (auto-extraction)
- 📸 **Instagram Import** - Import recipes directly from 
- 💳 **Stripe Subscriptions** - Monthly, Yearly, and Lifetime plans
- 📱 **Native Android App** - Built with Capacitor
- 🛒 **Shopping Lists** - Smart shopping list with deduplication
- 📅 **Weekly Meal Planning** - Plan your meals for the week
- 🎨 **Modern UI** - Built with React, TypeScript, and Tailwind CSS

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Convex (Serverless, Realtime Database)

- **Payments**: Stripe
- **AI**: Google Gemini API
- **Styling**: Tailwind CSS
- **Mobile**: Capacitor (Android)

## Architecture


- **Identity Verification**: Every Convex function uses `ctx.auth.getUserIdentity()` to validate requests
- **Subscription Limits**: Backend enforces import limits and validates ownership before mutations
- **Rate Limiting**: 1 scrape per 10 seconds per user to prevent abuse
- **Linear Control Flow**: Clear async/await structure without nested callbacks

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Convex account

- Google Gemini API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/cookly-app.git
cd cookly-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp ENV_EXAMPLE.txt .env
```

Edit `.env` and add your credentials:
```env

VITE_CONVEX_URL=https://your-project.convex.cloud
VITE_GEMINI_API_KEY=AIza_your_key_here
```

4. Start the development server:
```bash
# Terminal 1: Start Convex backend
npx convex dev

# Terminal 2: Start Vite frontend
npm run dev
```

5. Open your browser to `http://localhost:5173`

## Project Structure

```
cookly-app/
├── src/
│   ├── pages/              # Page components
│   │   ├── Onboarding/     # Onboarding flow screens
│   │   ├── HomePage.tsx    # Home page
│   │   ├── RecipesPage.tsx # Recipes list
│   │   ├── ShoppingPage.tsx # Shopping list
│   │   └── ProfilePage.tsx # User profile
│   ├── components/         # Reusable components
│   │   ├── ui/            # UI components
│   │   ├── BottomNav.tsx  # Bottom navigation
│   │   └── RecipeCard.tsx # Recipe card
│   ├── hooks/             # Custom React hooks
│   ├── utils/             # Utility functions
│   ├── styles/            # Global styles
│   ├── App.tsx            # Root component
│   └── main.tsx           # Entry point
├── convex/                # Backend code
│   ├── schema.ts          # Database schema
│   ├── users.ts           # User management
│   ├── recipes.ts         # Recipe CRUD
│   ├── weekly.ts          # Weekly planning
│   ├── shopping.ts        # Shopping lists
│   ├── stripe.ts          # Stripe integration
│   └── http.ts            # HTTP endpoints (webhooks)
├── public/                # Static assets
└── package.json           # Dependencies
```

## Subscription Tiers

### Free (€0/month)
- 5 recipe imports/month
- 1 week planning
- Basic features

### Pro Monthly (€9.99/month)
- Unlimited recipe imports
- Unlimited weekly planning
- AI recipe scanner unlimited
- Priority support

### Pro Yearly (€79.99/year)
- Save 33% (12 months for the price of 10)
- All Pro Monthly features

### Lifetime (€249.99 one-time)
- All Pro Yearly features
- Lifetime access
- VIP support

## Deployment

### Frontend (Vercel)
```bash
npm install -g vercel
vercel login
vercel link
vercel --prod
```

### Backend (Convex)
```bash
npx convex deploy
```

### Android App
```bash
npm run build
npx cap sync
npx cap open android
# Build APK in Android Studio
```

## Environment Variables

### Frontend (.env)

- `VITE_CONVEX_URL` - Convex deployment URL
- `VITE_GEMINI_API_KEY` - Google Gemini API key

### Convex (set via CLI)
```bash
npx convex env set GEMINI_API_KEY your_key_here
npx convex env set STRIPE_SECRET_KEY your_key_here --prod
npx convex env set STRIPE_WEBHOOK_SECRET your_webhook_secret_here --prod
```

**Note**: Stripe webhooks are required for subscription lifecycle events (created, updated, canceled).

## Support

For support, email support@cookly-app.com or open an issue on GitHub.
