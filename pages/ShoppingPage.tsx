import React from 'react';
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Link } from 'react-router-dom';
import { useBackNavigation } from '../hooks/useBackNavigation';

const getColorClass = (index: number) => {
  const colorIndex = (index % 6) + 1;
  return `bg-ingredient-${colorIndex}-bg`;
};

const ShoppingPage: React.FC = () => {
  const handleBack = useBackNavigation();
  const items = useQuery(api.shopping.getShoppingList);
  const toggleItem = useMutation(api.shopping.toggleShoppingItemByDetails).withOptimisticUpdate((localStore, args) => {
    const { name, amount } = args;
    const currentList = localStore.getQuery(api.shopping.getShoppingList);
    if (currentList) {
      const key = `${name.toLowerCase().trim().replace(/\s+/g, ' ')}|${amount ? amount.toLowerCase().trim().replace(/\s+/g, ' ') : ''}`;
      // Optimistically remove the item (toggle removes from shopping list)
      localStore.setQuery(api.shopping.getShoppingList, {}, currentList.filter(item => item.key !== key));
    }
  });
  const clearShoppingList = useMutation(api.shopping.clearShoppingList);

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleClear = async () => {
    if (!items || items.length === 0) return;
    if (window.confirm("Einkaufsliste wirklich leeren?")) {
      await clearShoppingList();
    }
  };

  return (
    <div className="page-enter relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark font-display">
      <div className="flex flex-col flex-1 pb-nav">

        {/* Header */}
        <div className="flex items-center px-4 py-3 gap-4 justify-between" style={{ paddingTop: 'max(1.5rem, var(--safe-area-inset-top))' }}>
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="touch-btn flex h-11 w-11 items-center justify-center radius-md bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark elevation-2"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="text-headline text-text-primary-light dark:text-text-primary-dark">
              Einkaufsliste
            </h1>
          </div>

          <button
            onClick={handleClear}
            disabled={!items || items.length === 0}
            className="touch-btn flex h-11 w-11 items-center justify-center radius-md bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark elevation-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Alle entfernen"
            aria-label="Einkaufsliste leeren"
          >
            <span className="material-symbols-outlined">delete_sweep</span>
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-2">
          {items && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 pt-12 animate-in fade-in">
              {/* Icon with Headline */}
              <div className="flex flex-col items-center">
                {/* Animated Icon */}
                <span className="material-symbols-outlined text-8xl text-primary animate-pulse mb-4">
                  shopping_basket
                </span>

                {/* Headline */}
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-center">
                  Noch keine <span className="text-primary italic">Zutaten</span>
                </h2>
              </div>

              {/* Subtext */}
              <p className="text-body text-text-secondary-light dark:text-text-secondary-dark text-center max-w-sm mt-4">
                Füge Zutaten aus deinen Rezepten hinzu.
              </p>

              {/* CTA Button */}
              <Link
                to="/tabs/categories"
                className="mt-8 flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold shadow-neo-light-convex hover:bg-primary-dark transition-all touch-btn"
              >
                <span className="material-symbols-outlined">restaurant_menu</span>
                Rezepte öffnen
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {(items ?? []).map((item, index) => (
                <button
                  key={item._id}
                  onClick={() => toggleItem({ name: item.name, amount: item.amount })}
                  className={
                    `stagger-item touch-btn relative cursor-pointer select-none ` +
                    `px-3.5 py-2 rounded-full text-body-sm font-medium ${getColorClass(index)} ` +
                    `text-black dark:text-white elevation-1`
                  }
                  title="Klicken zum Entfernen"
                >
                  {item.amount ? <span>{item.amount} </span> : null}
                  {item.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShoppingPage;
