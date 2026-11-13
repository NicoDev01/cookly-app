import React from 'react';
import { BatteryFull, Signal, Wifi } from 'lucide-react';
import { DEMO_POST } from './demoData';

/** Virtuelles Handy in echten Pixeln; ShareDemo skaliert es auf die Sheet-Breite. */
export const SCREEN = { w: 390, h: 844 };
export type DemoOs = 'ios' | 'android';
export type DemoPlatform = 'instagram' | 'tiktok' | 'facebook' | 'web';

export const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif';
export const POST = {
  ...DEMO_POST,
  name: 'Kochen mit Lea',
  title: 'Shakshuka in 30 Minuten',
  host: 'lecker-kochen.de',
  pageTitle: 'Shakshuka – das beste Rezept',
};
export const IG_GRADIENT = 'linear-gradient(45deg,#f58529,#dd2a7b 50%,#8134af 80%,#515bd4)';

/** Ziel für Kamera und Tipp: ShareDemo sucht [data-target] im Bildschirm. */
export const target = (id: 'share' | 'more' | 'cookly') => ({ 'data-target': id });

export const StatusBar: React.FC<{ os: DemoOs; dark?: boolean }> = ({ os, dark }) => (
  <div
    className="relative z-30 flex flex-none items-center justify-between font-semibold"
    style={{
      height: os === 'ios' ? 50 : 34,
      padding: os === 'ios' ? '14px 30px 0 40px' : '4px 18px 0 22px',
      color: dark ? '#fff' : '#000',
      fontSize: os === 'ios' ? 16 : 13,
      fontFamily: SYSTEM_FONT,
    }}
  >
    <span>{os === 'ios' ? '9:41' : '12:30'}</span>
    {os === 'ios' && <span className="absolute left-1/2 top-[11px] h-[30px] w-[120px] -translate-x-1/2 rounded-full bg-black" />}
    <span className="flex items-center gap-1.5">
      <Signal size={os === 'ios' ? 16 : 14} strokeWidth={2.6} />
      <Wifi size={os === 'ios' ? 16 : 14} strokeWidth={2.6} />
      <BatteryFull size={os === 'ios' ? 22 : 17} strokeWidth={2} />
    </span>
  </div>
);

/** Strich unten (iOS) bzw. Gesten-Leiste (Android). */
export const HomeBar: React.FC<{ os: DemoOs; dark?: boolean }> = ({ os, dark }) => (
  <div className="flex flex-none items-center justify-center" style={{ height: os === 'ios' ? 30 : 22 }}>
    <span className="rounded-full" style={{ width: os === 'ios' ? 136 : 110, height: os === 'ios' ? 5 : 4, background: dark ? '#fff' : '#000', opacity: dark ? 0.9 : 0.85 }} />
  </div>
);

const AVATAR_COLORS = ['#f4a261', '#7fb3d5', '#e76f51', '#90be6d', '#c39bd3', '#f6bd60', '#84a59d', '#e5989b'];
export const Avatar: React.FC<{ size: number; i?: number; ring?: string; image?: string }> = ({ size, i = 0, ring, image }) => (
  <span
    className="block flex-none rounded-full bg-cover bg-center"
    style={{
      width: size,
      height: size,
      background: image ? `center/cover url(${image})` : `linear-gradient(135deg, ${AVATAR_COLORS[i % 8]}, ${AVATAR_COLORS[(i + 3) % 8]})`,
      boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
    }}
  />
);

/** Dunkle Bühne für Instagram/TikTok: Video als Standbild, Verlauf unten. */
export const VideoBackdrop: React.FC = () => (
  <>
    <img src={POST.image} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: '50% 40%' }} />
    <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/45 to-transparent" />
    <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
  </>
);
