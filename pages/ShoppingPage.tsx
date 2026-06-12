import React from 'react';
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { Link } from 'react-router-dom';
import { IconButton } from '../components/ui/cookly/IconButton';
import {
  formatShoppingItemLabel,
  groupShoppingItemsByRecipe,
  groupShoppingItemsBySupermarketSection,
  ShoppingListViewItem,
} from '../utils/shoppingListView';

const getColorClass = (index: number) => {
  const colorIndex = (index % 10) + 1;
  return `bg-ingredient-${colorIndex}-bg`;
};

const ShoppingPage: React.FC = () => {
  const items = useQuery(api.shopping.getShoppingList);
  const [isSupermarketMode, setIsSupermarketMode] = React.useState(false);
  const toggleItem = useMutation(api.shopping.toggleShoppingItem).withOptimisticUpdate((localStore, args) => {
    const currentList = localStore.getQuery(api.shopping.getShoppingList);
    if (currentList) {
      localStore.setQuery(api.shopping.getShoppingList, {}, currentList.map((item) => (
        item._id === args.id ? { ...item, checked: !item.checked } : item
      )));
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

  const groupedItems = React.useMemo(() => {
    const list = (items ?? []) as ShoppingListViewItem[];
    return isSupermarketMode
      ? groupShoppingItemsBySupermarketSection(list)
      : groupShoppingItemsByRecipe(list);
  }, [items, isSupermarketMode]);

  return (
    <div className="page-enter relative flex w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark font-display">
      <div className="flex flex-col flex-1">

        {/* Header */}
        <div className="flex items-center px-6 py-3 gap-4 justify-between" style={{ paddingTop: 'max(1.5rem, var(--safe-area-inset-top))' }}>
          <div className="flex items-center gap-4">
            <h1 className="text-headline text-text-primary-light dark:text-text-primary-dark">
              Einkaufsliste
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <IconButton
              icon="local_grocery_store"
              onClick={() => setIsSupermarketMode((value) => !value)}
              disabled={!items || items.length === 0}
              active={isSupermarketMode}
              className={`shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave !rounded-full disabled:opacity-50 disabled:cursor-not-allowed ${
                isSupermarketMode
                  ? '!bg-primary !text-white hover:!bg-primary hover:!text-white'
                  : '!bg-card-light dark:!bg-card-dark !text-text-primary-light dark:!text-text-primary-dark'
              }`}
              title="Supermarktmodus"
              aria-label="Supermarktmodus umschalten"
              aria-pressed={isSupermarketMode}
            />
            <IconButton
              icon="delete_sweep"
              onClick={handleClear}
              disabled={!items || items.length === 0}
              className="bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark shadow-neo-light-convex dark:shadow-neo-dark-convex active:shadow-neo-light-concave dark:active:shadow-neo-dark-concave !rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              title="Alle entfernen"
              aria-label="Einkaufsliste leeren"
            />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-2">
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
            <div className="flex flex-col gap-5">
              {groupedItems.map((group) => (
                <section key={group.key} className="space-y-2">
                  {group.title ? (
                    <h2 className="text-sm font-semibold text-text-secondary-light dark:text-text-secondary-dark">
                      {group.title}
                    </h2>
                  ) : null}
                  <div className="flex flex-wrap gap-2.5">
                    {group.items.map((item, index) => (
                      <button
                        key={item._id}
                        onClick={() => toggleItem({ id: item._id as Id<"shoppingItems"> })}
                        className={
                          `relative cursor-pointer select-none appearance-none border-0 transition-all duration-300 ease-out active:scale-95 ` +
                          `px-3 py-1.5 rounded-full text-sm font-medium ${getColorClass(index)} ` +
                          `text-black dark:text-white shadow-neomorphism-pill dark:shadow-dark-neomorphism-pill ` +
                          `${item.checked ? 'opacity-45 line-through decoration-2' : 'opacity-100 no-underline'}`
                        }
                        title="Klicken zum Markieren"
                        aria-pressed={item.checked}
                      >
                        {formatShoppingItemLabel(item)}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
        <div style={{ height: 'calc(var(--nav-height) + var(--safe-area-inset-bottom, 0px))' }} className="w-full shrink-0" />
      </div>
    </div>
  );
};

export default ShoppingPage;
