"use client";

import React, { useEffect, useRef, useState } from "react";
import { Recipe } from '../types';

type MenuItem = { name: string; href?: string; onClick?: () => void; icon?: React.ReactElement | string };

interface SidebarProps {
  isOpen: boolean;
  recipes: Recipe[];
  selectedRecipeId: string | null;
  onRecipeSelect: (id: string) => void;
  onClose: () => void;
}

const Menu = ({ children, items }: { children: React.ReactNode; items: MenuItem[] }) => {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <div>
      <button
        className="w-full flex items-center justify-between text-gray-600 p-2 rounded-lg hover:bg-gray-50/50 active:bg-gray-100/50 duration-150"
        onClick={() => setIsOpened((v) => !v)}
        aria-expanded={isOpened}
        aria-controls="submenu"
      >
        <div className="flex items-center gap-x-2">{children}</div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-5 h-5 duration-150 ${isOpened ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpened && (
        <ul id="submenu" className="mx-4 px-2 border-l border-gray-300/50 text-sm font-medium">
          {items.map((item, idx) => (
            <li key={idx}>
              {item.onClick ? (
                <button
                  onClick={item.onClick}
                  className="flex items-center gap-x-2 text-gray-600 p-2 rounded-lg hover:bg-gray-50/50 active:bg-gray-100/50 duration-150 w-full text-left"
                >
                  {item.icon ? <div className="text-gray-500">{item.icon}</div> : null}
                  {item.name}
                </button>
              ) : (
                <a
                  href={item.href}
                  className="flex items-center gap-x-2 text-gray-600 p-2 rounded-lg hover:bg-gray-50/50 active:bg-gray-100/50 duration-150"
                >
                  {item.icon ? <div className="text-gray-500">{item.icon}</div> : null}
                  {item.name}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, recipes, selectedRecipeId, onRecipeSelect, onClose }) => {
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Gruppiere Rezepte nach Kategorien
  const groupedRecipes = recipes.reduce((groups: Record<string, Recipe[]>, recipe) => {
    if (!groups[recipe.category]) {
      groups[recipe.category] = [];
    }
    groups[recipe.category].push(recipe);
    return groups;
  }, {});

  const categories = Object.keys(groupedRecipes);

  // Erstelle Menu-Items für die Rezepte innerhalb einer Kategorie
  // Sidebar wird NICHT mehr geschlossen bei Rezept-Auswahl
  const createRecipeMenuItems = (categoryRecipes: Recipe[]) => {
    return categoryRecipes.map(recipe => ({
      name: recipe.title,
      onClick: () => {
        onRecipeSelect(recipe._id);
        // Sidebar bleibt offen - kein onClose() mehr hier
      }
    }));
  };

  // Icon für Kategorie basierend auf dem Namen
  const getCategoryIcon = (category: string) => {
    const lowerCategory = category.toLowerCase();
    
    if (lowerCategory.includes('pasta') || lowerCategory.includes('nudel')) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-5 h-5 text-gray-500"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6v12M10 6v12M14 6v12M18 6v12" />
        </svg>
      );
    }
    
    // Standard-Icon für andere Kategorien
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="w-5 h-5 text-gray-500"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
        />
      </svg>
    );
  };

  // Click-Handler für das Schließen bei Klick außerhalb der Sidebar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  return (
    <>
      <div 
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 z-40 w-80 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="fixed top-0 left-0 w-full h-full border-r bg-white rounded-r-2xl space-y-8 sm:w-80">
          <div className="flex flex-col h-full px-4">
            <div className="h-20 flex items-center pl-2">
              <div className="w-full flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white tracking-tight">
                  Rezeptbuch
                </h3>
                {/* Schließen-Button mit Pfeil-Icon */}
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-gray-100/50 active:bg-gray-200/50 transition-colors duration-150"
                  aria-label="Sidebar schließen"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-5 h-5 text-gray-600"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 19.5L8.25 12l7.5-7.5"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="overflow-auto">
              <ul className="text-sm font-medium flex-1">
                {/* Rezept-Kategorien als Menu */}
                {categories.map((category) => (
                  <li key={category}>
                    <Menu items={createRecipeMenuItems(groupedRecipes[category])}>
                      {getCategoryIcon(category)}
                      {category}
                    </Menu>
                  </li>
                ))}
              </ul>


            </div>
          </div>
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
