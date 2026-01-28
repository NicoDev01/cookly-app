/** @type {import('tailwindcss').Config} */
import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        "background-light": "#f0f2f5",
        "background-dark": "#112021",
        "text-primary-light": "#333333",
        "text-secondary-light": "#888888",
        "text-primary-dark": "#e0e0e0",
        "text-secondary-dark": "#a0a0a0",
        "card-light": "#f0f2f5",
        "card-dark": "#1a2c2e",
        "ingredient-1": "#f59e0b",
        "ingredient-1-bg": "rgba(245, 158, 11, 0.2)",
        "ingredient-2": "#84cc16",
        "ingredient-2-bg": "rgba(132, 204, 22, 0.2)",
        "ingredient-3": "#ef4444",
        "ingredient-3-bg": "rgba(239, 68, 68, 0.2)",
        "ingredient-4": "#a855f7",
        "ingredient-4-bg": "rgba(168, 85, 247, 0.2)",
        "ingredient-5": "#3b82f6",
        "ingredient-5-bg": "rgba(59, 130, 246, 0.2)",
        "ingredient-6": "#14b8a6",
        "ingredient-6-bg": "rgba(20, 184, 166, 0.2)",
        "ingredient-7": "#ec4899",
        "ingredient-7-bg": "rgba(236, 72, 153, 0.2)",
        "ingredient-8": "#6366f1",
        "ingredient-8-bg": "rgba(99, 102, 241, 0.2)",
        "ingredient-9": "#eab308",
        "ingredient-9-bg": "rgba(234, 179, 8, 0.2)",
        "ingredient-10": "#10b981",
        "ingredient-10-bg": "rgba(16, 185, 129, 0.2)",
      },
      fontFamily: {
        "sans": ["Outfit", "sans-serif"],
        "display": ["Outfit", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.5rem",
        "lg": "1rem",
        "xl": "1.5rem",
        "full": "9999px"
      },
      boxShadow: {
        'neomorphism-outset': '5px 5px 10px #d4d6d6, -5px -5px 10px #ffffff',
        'dark-neomorphism-outset': '5px 5px 10px #0c1516, -5px -5px 10px #162b2c',
        'neomorphism-inset': 'inset 5px 5px 10px #d4d6d6, inset -5px -5px 10px #ffffff',
        'dark-neomorphism-inset': 'inset 5px 5px 10px #0c1516, inset -5px -5px 10px #162b2c',
        'neomorphism-pill': '2px 2px 4px #d4d6d6, -2px -2px 4px #ffffff',
        'dark-neomorphism-pill': '2px 2px 4px #0c1516, -2px -2px 4px #162b2c',
        'neo-light-convex': '6px 6px 12px #d9dbde, -6px -6px 12px #ffffff',
        'neo-dark-convex': '6px 6px 12px #0c1516, -6px -6px 12px #162b2c',
        'neo-light-concave': 'inset 6px 6px 12px #d9dbde, inset -6px -6px 12px #ffffff',
        'neo-dark-concave': 'inset 6px 6px 12px #0c1516, inset -6px -6px 12px #162b2c',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s infinite',
      }
    },
  },
  plugins: [
    forms({ strategy: 'class' }),
    containerQueries,
  ],
}
