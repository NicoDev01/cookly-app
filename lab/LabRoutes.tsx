import React from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { RECIPE_VARIANTS } from './variants';
import { shakshuka } from './fixtures/shakshuka';

/**
 * Labor (nur im Dev-Server, siehe App.tsx): Kopien einzelner Screens mit festen Testdaten.
 *   #/lab               Übersicht aller Varianten nebeneinander
 *   #/lab/recipe/v1     eine Variante allein (im Browser auf Handy-Größe stellen)
 */
const PHONE = { w: 375, h: 812 };
const SCALE = 0.8;

const LabScreen: React.FC = () => {
  const { variant } = useParams();
  const entry = RECIPE_VARIANTS.find((v) => v.id === variant);
  if (!entry) return <p className="p-6">Variante „{variant}“ gibt es nicht. <Link className="underline" to="/lab">Zur Übersicht</Link></p>;
  const { Component } = entry;
  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white font-display">
      <div className="h-full w-full overflow-y-auto overflow-x-hidden scrollbar-hide overscroll-y-contain">
        <Component recipe={shakshuka} />
      </div>
    </div>
  );
};

const LabOverview: React.FC = () => {
  const base = `${window.location.pathname}${window.location.search}`;
  return (
    <div className="min-h-[100dvh] bg-background-light px-6 py-10 font-display text-[#111718]">
      <header className="mx-auto mb-10 max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Labor · nur Dev</p>
        <h1 className="mt-1 text-3xl font-black">Rezeptseite</h1>
        <p className="mt-1 text-sm text-gray-500">Jede Variante ist ein echter React-Screen mit Testdaten. Die App selbst bleibt unverändert.</p>
      </header>
      <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-10">
        {RECIPE_VARIANTS.map((v) => (
          <figure key={v.id} className="m-0 flex flex-col items-center gap-4">
            <div
              className="overflow-hidden rounded-[44px] border-[8px] border-[#1c1c1e] bg-white shadow-[0_40px_70px_-40px_rgba(20,40,30,0.4)]"
              style={{ width: PHONE.w * SCALE + 16, height: PHONE.h * SCALE + 16 }}
            >
              <iframe
                title={`${v.id} ${v.title}`}
                src={`${base}#/lab/recipe/${v.id}`}
                style={{ width: PHONE.w, height: PHONE.h, transform: `scale(${SCALE})`, transformOrigin: 'top left', border: 0 }}
              />
            </div>
            <figcaption className="text-center">
              <div className="font-bold">
                <span className="mr-1.5 text-gray-400">{v.id}</span>{v.title}
              </div>
              <div className="text-sm text-gray-500">{v.note}</div>
              <Link to={`/lab/recipe/${v.id}`} className="mt-1 inline-block text-sm font-semibold text-[#2f5d46] underline-offset-2 hover:underline">
                Allein öffnen
              </Link>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
};

const LabRoutes: React.FC = () => (
  <Routes>
    <Route index element={<LabOverview />} />
    <Route path="recipe/:variant" element={<LabScreen />} />
  </Routes>
);

export default LabRoutes;
