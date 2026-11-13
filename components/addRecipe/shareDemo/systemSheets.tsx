import React from 'react';
import { BookmarkPlus, Copy, Glasses, Mail, MessageCircle, Pencil, StickyNote, X } from 'lucide-react';
import { SiGmail, SiGoogledrive, SiGooglemessages, SiTelegram, SiWhatsapp } from 'react-icons/si';
import { ONB_IMG } from '../../onboarding/onboardingData';
import { Avatar, HomeBar, POST, SYSTEM_FONT, target, type DemoOs, type DemoPlatform } from './kit';

/** System-Teilen-Blatt, Cookly an zweiter Stelle der App-Reihe (dort, wo zuletzt genutzte Apps landen). */
const preview = (platform: DemoPlatform) =>
  platform === 'web'
    ? { title: POST.pageTitle, host: POST.host }
    : { title: platform === 'facebook' ? `Beitrag von ${POST.name}` : `Beitrag von ${POST.author}`, host: `${platform}.com` };

const CooklyIcon: React.FC<{ size: number; radius: number }> = ({ size, radius }) => (
  <span {...target('cookly')} className="block overflow-hidden bg-white shadow-sm" style={{ width: size, height: size, borderRadius: radius }}>
    <img src={ONB_IMG.icon} alt="" className="size-full object-cover" />
  </span>
);

const IosApp: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex w-[76px] flex-none flex-col items-center gap-1.5">
    {children}
    <span className="text-[11.5px]">{label}</span>
  </div>
);

const IosTile: React.FC<{ bg: string; children: React.ReactNode }> = ({ bg, children }) => (
  <span className="flex size-[62px] items-center justify-center rounded-[15px] text-white" style={{ background: bg }}>{children}</span>
);

export const IosShareSheet: React.FC<{ open: boolean; platform: DemoPlatform }> = ({ open, platform }) => {
  const p = preview(platform);
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 rounded-t-[14px] bg-[#f2f2f7] text-black transition-transform duration-500 ease-[cubic-bezier(0.2,0.9,0.3,1)]"
      style={{ transform: open ? 'translateY(0)' : 'translateY(105%)', fontFamily: SYSTEM_FONT }}
    >
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <img src={POST.image} alt="" className="size-[50px] rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{p.title}</p>
          <p className="truncate text-[13px] text-[#8a8a8e]">{p.host} · Optionen ›</p>
        </div>
        <span className="flex size-8 items-center justify-center rounded-full bg-[#e3e3e8] text-[#6d6d72]"><X size={17} strokeWidth={2.6} /></span>
      </div>
      <div className="mx-4 h-px bg-black/10" />
      <div className="flex gap-1 overflow-hidden px-3 pb-3 pt-4">
        {['Lena', 'Mama', 'Jonas', 'Tim'].map((n, i) => (
          <div key={n} className="flex w-[78px] flex-none flex-col items-center gap-1.5 text-[11.5px]"><Avatar size={62} i={i} />{n}</div>
        ))}
      </div>
      <div className="mx-4 h-px bg-black/10" />
      <div className="flex gap-1 overflow-hidden px-3 pb-4 pt-4">
        <IosApp label="AirDrop"><IosTile bg="linear-gradient(#5ac8fa,#007aff)"><span className="size-7 rounded-full border-[3px] border-white" /></IosTile></IosApp>
        <IosApp label="Cookly"><CooklyIcon size={62} radius={15} /></IosApp>
        <IosApp label="Nachrichten"><IosTile bg="linear-gradient(#65e563,#2bc24a)"><MessageCircle size={32} fill="#fff" strokeWidth={0} /></IosTile></IosApp>
        <IosApp label="Mail"><IosTile bg="linear-gradient(#2ea8ff,#1a73e8)"><Mail size={32} /></IosTile></IosApp>
        <IosApp label="WhatsApp"><IosTile bg="#25D366"><SiWhatsapp size={32} /></IosTile></IosApp>
      </div>
      <div className="mx-4 overflow-hidden rounded-xl bg-white text-[16px]">
        {[['Kopieren', Copy], ['Zur Leseliste hinzufügen', Glasses], ['Lesezeichen hinzufügen', BookmarkPlus], ['Zu Notizen hinzufügen', StickyNote]].map(([label, Icon], i) => {
          const I = Icon as typeof Copy;
          return (
            <div key={label as string} className={`flex items-center justify-between px-4 py-3 ${i ? 'border-t border-black/10' : ''}`}>
              {label as string}<I size={20} />
            </div>
          );
        })}
      </div>
      <p className="px-8 py-3 text-[16px] text-[#007aff]">Aktionen bearbeiten …</p>
      <HomeBar os="ios" />
    </div>
  );
};

const DroidApp: React.FC<{ label: string; bg?: string; children: React.ReactNode }> = ({ label, bg, children }) => (
  <div className="flex flex-col items-center gap-1.5 text-center">
    {bg ? <span className="flex size-[54px] items-center justify-center rounded-full text-white" style={{ background: bg }}>{children}</span> : children}
    <span className="text-[12.5px] leading-tight text-[#1f1f1f]">{label}</span>
  </div>
);

export const AndroidShareSheet: React.FC<{ open: boolean; platform: DemoPlatform }> = ({ open, platform }) => {
  const p = preview(platform);
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 rounded-t-[28px] bg-[#f3f4f9] text-[#1f1f1f] transition-transform duration-500 ease-[cubic-bezier(0.2,0.9,0.3,1)]"
      style={{ transform: open ? 'translateY(0)' : 'translateY(105%)', fontFamily: SYSTEM_FONT }}
    >
      <div className="mx-auto mb-2 mt-3 h-1 w-9 rounded-full bg-[#c4c6cf]" />
      <div className="mx-4 flex items-center gap-3 rounded-2xl bg-white p-3">
        <img src={POST.image} alt="" className="size-[52px] rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{p.title}</p>
          <p className="truncate text-[13px] text-[#5f6368]">https://{p.host}/…</p>
        </div>
        <span className="flex size-10 items-center justify-center rounded-full bg-[#e8eaf1]"><Copy size={18} /></span>
      </div>
      <div className="mt-2 flex justify-around px-2 pb-3 pt-4">
        {['Lena', 'Mama', 'Jonas', 'Tim'].map((n, i) => (
          <div key={n} className="relative flex w-[76px] flex-col items-center gap-1.5 text-[12.5px]">
            <Avatar size={56} i={i} />
            <span className="absolute left-[46px] top-[38px] flex size-[22px] items-center justify-center rounded-full border-2 border-[#f3f4f9] bg-[#25D366] text-white"><SiWhatsapp size={12} /></span>
            {n}
          </div>
        ))}
      </div>
      <div className="mx-4 h-px bg-black/10" />
      <div className="grid grid-cols-4 gap-y-5 px-3 pb-4 pt-5">
        <DroidApp label="Nachrichten" bg="#1a73e8"><SiGooglemessages size={28} /></DroidApp>
        <DroidApp label="Cookly"><span className="flex size-[54px] items-center justify-center"><CooklyIcon size={54} radius={27} /></span></DroidApp>
        <DroidApp label="WhatsApp" bg="#25D366"><SiWhatsapp size={28} /></DroidApp>
        <DroidApp label="Gmail" bg="#fff"><SiGmail size={26} color="#ea4335" /></DroidApp>
        <DroidApp label="Telegram" bg="#27a7e7"><SiTelegram size={26} /></DroidApp>
        <DroidApp label="Drive" bg="#fff"><SiGoogledrive size={26} color="#1fa463" /></DroidApp>
        <DroidApp label="Notizen" bg="#fbbc04"><Pencil size={24} /></DroidApp>
        <DroidApp label="In die Nähe" bg="#5f6368"><span className="size-6 rounded-full border-[3px] border-white" /></DroidApp>
      </div>
      <HomeBar os="android" />
    </div>
  );
};

export const SystemShareSheet: React.FC<{ os: DemoOs; open: boolean; platform: DemoPlatform }> = ({ os, ...rest }) =>
  os === 'ios' ? <IosShareSheet {...rest} /> : <AndroidShareSheet {...rest} />;
