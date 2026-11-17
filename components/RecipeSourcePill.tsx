import React from 'react';
import { FaFacebook, FaInstagram, FaTiktok, FaGlobe } from 'react-icons/fa';
import { ArrowUpRight } from 'lucide-react';
import type { IconType } from 'react-icons';

const SOURCES: { hosts: string[]; label: string; Icon: IconType; color: string }[] = [
  { hosts: ['instagram.com'], label: 'Instagram', Icon: FaInstagram, color: '#E1306C' },
  { hosts: ['tiktok.com'], label: 'TikTok', Icon: FaTiktok, color: '#111111' },
  { hosts: ['facebook.com', 'fb.watch'], label: 'Facebook', Icon: FaFacebook, color: '#1877F2' },
];
const WEBSITE = { label: 'Website', Icon: FaGlobe, color: '#4b5563' };

/** Plattform nach Hostname (auch Subdomains wie m.facebook.com, vm.tiktok.com); null bei kaputter oder nicht-http(s) URL. */
function sourceFor(url: string) {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    host = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
  return SOURCES.find((s) => s.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? WEBSITE;
}

/**
 * Quelle als Pille unten links im Rezeptbild: Plattform-Icon in Markenfarbe, Name, Pfeil für „öffnet extern“.
 * Muss in einem `relative` Container liegen; stoppt den Klick, damit das Bild nicht zoomt.
 */
const RecipeSourcePill: React.FC<{ url: string }> = ({ url }) => {
  const source = sourceFor(url);
  if (!source) return null;
  const { Icon } = source;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={`Original auf ${source.label} öffnen`}
      className="absolute bottom-7 left-4 z-10 flex items-center gap-1 rounded-full border border-white/40 bg-white/85 py-1 pl-2 pr-1.5 text-[11px] font-semibold text-gray-900 shadow-md shadow-black/10 backdrop-blur-xl transition-transform active:scale-95"
    >
      <Icon className="!text-[12px]" style={{ color: source.color }} aria-hidden />
      <span>{source.label}</span>
      <ArrowUpRight size={12} strokeWidth={2.5} className="text-gray-500" aria-hidden />
    </a>
  );
};

export default RecipeSourcePill;
