import React from 'react';
import {
  ArrowRight, Bell, Bookmark, BookOpen, ChevronLeft, ChevronRight, CirclePlus, Clapperboard, Copy, Download, Ellipsis,
  EllipsisVertical, Flag, Forward, Globe, Heart, House, Inbox, Info, Link, Lock, Menu, MessageCircle, Music2, Plus,
  Repeat2, RotateCw, Search, Send, Share, Share2, SlidersHorizontal, SquarePlus, Star, Store, ThumbsUp, Tv, User,
  UserPlus, Users, X,
} from 'lucide-react';
import { SiMessenger, SiWhatsapp } from 'react-icons/si';
import { Avatar, HomeBar, POST, StatusBar, SYSTEM_FONT, VideoBackdrop, target, type DemoOs } from './kit';

/**
 * Nachbau der Teilen-Wege (Stand Nov. 2026, nach Erinnerung, nicht gegen die Apps geprüft):
 * Feed/Seite → Teilen-Symbol → Teilen-Blatt der App → „Teilen“/„Mehr“ → System-Teilen-Blatt.
 * Jede App liefert `Feed` und optional `AppSheet` mit den Zielen share und more.
 */
type SceneProps = { os: DemoOs };
type SheetProps = SceneProps & { open: boolean };

const Screen: React.FC<{ dark?: boolean; children: React.ReactNode }> = ({ dark, children }) => (
  <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ background: dark ? '#000' : '#fff', color: dark ? '#fff' : '#050505', fontFamily: SYSTEM_FONT }}>
    {children}
  </div>
);

/** Blatt, das von unten einfährt; Abdunklung darüber liegt in ShareDemo. */
export const SheetFrame: React.FC<{ open: boolean; dark?: boolean; radius?: number; children: React.ReactNode }> = ({ open, dark, radius = 16, children }) => (
  <div
    className="absolute inset-x-0 bottom-0 z-20 transition-transform duration-500 ease-[cubic-bezier(0.2,0.9,0.3,1)]"
    style={{ transform: open ? 'translateY(0)' : 'translateY(105%)', borderRadius: `${radius}px ${radius}px 0 0`, background: dark ? '#1c1c1e' : '#fff', color: dark ? '#fff' : '#000', fontFamily: SYSTEM_FONT }}
  >
    {children}
  </div>
);

const Grab: React.FC<{ dark?: boolean }> = ({ dark }) => <div className="mx-auto mb-3 mt-2.5 h-[5px] w-10 rounded-full" style={{ background: dark ? '#555' : '#d1d1d6' }} />;

const Action: React.FC<{ icon: React.ReactNode; label: string; bg?: string; color?: string; size?: number; t?: 'more' }> = ({ icon, label, bg = '#efefef', color = '#000', size = 56, t }) => (
  <div className="flex w-[70px] flex-none flex-col items-center gap-1.5 text-center">
    <span {...(t ? target(t) : {})} className="flex items-center justify-center rounded-full" style={{ width: size, height: size, background: bg, color }}>
      {icon}
    </span>
    <span className="text-[12px] leading-tight">{label}</span>
  </div>
);

const NAMES = ['Lena', 'Jonas', 'Mama', 'Kochgruppe', 'Tim', 'Sarah'];

/* ───────────── Instagram ───────────── */

export const InstagramFeed: React.FC<SceneProps> = ({ os }) => (
  <Screen dark>
    <VideoBackdrop />
    <StatusBar os={os} dark />
    <div className="relative z-10 flex items-center justify-between px-4 pt-1">
      <span className="flex items-center gap-1 text-[22px] font-bold">Reels</span>
      <Clapperboard size={26} />
    </div>
    <div className="relative z-10 mt-auto flex items-end gap-3 px-4 pb-4">
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-center gap-2.5">
          <Avatar size={34} i={2} ring="#fff" />
          <span className="text-[15px] font-semibold">{POST.author}</span>
          <span className="rounded-lg border border-white/80 px-2.5 py-[3px] text-[13px] font-semibold">Folgen</span>
        </div>
        <p className="mt-2.5 line-clamp-2 text-[14px] leading-snug">{POST.caption} <span className="text-white/70">… mehr</span></p>
        <div className="mt-2 flex items-center gap-1.5 text-[13px]"><Music2 size={13} /> {POST.author} · Originalton</div>
      </div>
      <div className="flex w-12 flex-none flex-col items-center gap-5 pb-1 text-[12.5px] font-semibold">
        <span className="flex flex-col items-center gap-1"><Heart size={29} strokeWidth={1.9} />24,1K</span>
        <span className="flex flex-col items-center gap-1"><MessageCircle size={28} strokeWidth={1.9} style={{ transform: 'scaleX(-1)' }} />412</span>
        <span className="flex flex-col items-center gap-1"><Repeat2 size={28} strokeWidth={1.9} />96</span>
        <span className="flex flex-col items-center gap-1"><span {...target('share')} className="flex size-9 items-center justify-center"><Send size={27} strokeWidth={1.9} /></span>1.208</span>
        <Ellipsis size={24} />
        <span className="size-8 rounded-md border-2 border-white bg-cover bg-center" style={{ backgroundImage: `url(${POST.image})` }} />
      </div>
    </div>
    <div className="relative z-10 flex flex-none items-center justify-around bg-black pt-3">
      <House size={27} /><Search size={27} /><SquarePlus size={27} /><Clapperboard size={27} fill="#fff" stroke="#000" /><Avatar size={28} i={5} />
    </div>
    <div className="relative z-10 bg-black"><HomeBar os={os} dark /></div>
  </Screen>
);

export const InstagramSheet: React.FC<SheetProps> = ({ os, open }) => (
  <SheetFrame open={open}>
    <Grab />
    <div className="mx-4 flex items-center gap-3">
      <div className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-[#efefef] px-3 text-[15px] text-[#737373]"><Search size={18} /> Suchen</div>
      <UserPlus size={24} />
    </div>
    <div className="grid grid-cols-3 gap-y-4 px-4 pb-4 pt-5">
      {NAMES.map((n, i) => (
        <div key={n} className="flex flex-col items-center gap-1.5 text-[13px]"><Avatar size={74} i={i} />{n}</div>
      ))}
    </div>
    <div className="flex gap-1 overflow-hidden border-t border-black/10 px-2 pb-1 pt-4">
      <Action icon={<CirclePlus size={26} />} label="Zu Story hinzufügen" />
      <Action icon={<Link size={24} />} label="Link kopieren" />
      <Action icon={os === 'ios' ? <Share size={24} /> : <Share2 size={24} />} label="Teilen" t="more" />
      <Action icon={<SiWhatsapp size={28} />} label="WhatsApp" bg="#25D366" color="#fff" />
      <Action icon={<SiMessenger size={26} />} label="Messenger" bg="linear-gradient(45deg,#0a7cff,#a334fa,#ff6968)" color="#fff" />
    </div>
    <HomeBar os={os} />
  </SheetFrame>
);

/* ───────────── TikTok ───────────── */

export const TikTokFeed: React.FC<SceneProps> = ({ os }) => (
  <Screen dark>
    <VideoBackdrop />
    <StatusBar os={os} dark />
    <div className="relative z-10 flex items-center justify-between px-4 pt-2">
      <Tv size={24} />
      <div className="flex items-center gap-5 text-[17px] font-semibold">
        <span className="text-white/65">Entdecken</span>
        <span className="text-white/65">Folge ich</span>
        <span className="relative">Für dich<span className="absolute -bottom-2 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-white" /></span>
      </div>
      <Search size={25} />
    </div>
    <div className="relative z-10 mt-auto flex items-end gap-3 px-3 pb-4">
      <div className="min-w-0 flex-1 pb-1">
        <p className="text-[16px] font-semibold">{POST.author}</p>
        <p className="mt-1.5 line-clamp-2 text-[14.5px] leading-snug">{POST.caption} <span className="font-semibold">mehr</span></p>
        <div className="mt-2.5 flex items-center gap-1.5 text-[14px]"><Music2 size={14} /> Originalton – {POST.author}</div>
      </div>
      <div className="flex w-14 flex-none flex-col items-center gap-[18px] text-[13px] font-semibold">
        <span className="relative mb-2"><Avatar size={48} i={2} ring="#fff" /><span className="absolute -bottom-2.5 left-1/2 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-[#fe2c55]"><Plus size={14} strokeWidth={3} /></span></span>
        <span className="flex flex-col items-center gap-1"><Heart size={34} fill="#fff" strokeWidth={0} />86,4K</span>
        <span className="flex flex-col items-center gap-1"><MessageCircle size={33} fill="#fff" strokeWidth={0} />1.024</span>
        <span className="flex flex-col items-center gap-1"><Bookmark size={31} fill="#fff" strokeWidth={0} />12,3K</span>
        <span className="flex flex-col items-center gap-1"><span {...target('share')} className="flex size-10 items-center justify-center"><Forward size={34} fill="#fff" strokeWidth={0} /></span>3.210</span>
        <span className="size-11 animate-spin rounded-full border-[7px] border-[#222] bg-cover bg-center [animation-duration:5s]" style={{ backgroundImage: `url(${POST.image})` }} />
      </div>
    </div>
    <div className="relative z-10 flex flex-none items-center justify-around bg-black pt-2 text-[11px]">
      <span className="flex flex-col items-center gap-0.5"><House size={25} fill="#fff" />Start</span>
      <span className="flex flex-col items-center gap-0.5 text-white/70"><Users size={25} />Freunde</span>
      <span className="relative flex h-8 w-12 items-center justify-center">
        <span className="absolute inset-y-0 left-0 w-11 rounded-lg bg-[#25f4ee]" />
        <span className="absolute inset-y-0 right-0 w-11 rounded-lg bg-[#fe2c55]" />
        <span className="absolute inset-y-0 left-[2px] flex w-11 items-center justify-center rounded-lg bg-white text-black"><Plus size={20} strokeWidth={3} /></span>
      </span>
      <span className="flex flex-col items-center gap-0.5 text-white/70"><Inbox size={25} />Postfach</span>
      <span className="flex flex-col items-center gap-0.5 text-white/70"><User size={25} />Profil</span>
    </div>
    <div className="relative z-10 bg-black"><HomeBar os={os} dark /></div>
  </Screen>
);

export const TikTokSheet: React.FC<SheetProps> = ({ os, open }) => (
  <SheetFrame open={open} radius={12}>
    <div className="relative flex h-12 items-center justify-center text-[15px] font-semibold">
      Senden an<X size={22} className="absolute right-4" />
    </div>
    <div className="flex gap-1 overflow-hidden px-2 pb-4 pt-1">
      {NAMES.slice(0, 5).map((n, i) => (
        <div key={n} className="flex w-[74px] flex-none flex-col items-center gap-1.5 text-[12px]"><Avatar size={56} i={i + 1} />{n}</div>
      ))}
    </div>
    <div className="flex gap-1 overflow-hidden border-t border-black/10 px-2 pt-4">
      <Action icon={<Repeat2 size={24} />} label="Reposten" bg="#fecb2f" color="#fff" size={50} />
      <Action icon={<Link size={22} />} label="Link kopieren" bg="#2f7cf6" color="#fff" size={50} />
      <Action icon={<SiWhatsapp size={26} />} label="WhatsApp" bg="#25D366" color="#fff" size={50} />
      <Action icon={<MessageCircle size={24} fill="#fff" strokeWidth={0} />} label="SMS" bg="#39c25b" color="#fff" size={50} />
      <Action icon={<Ellipsis size={24} />} label="Mehr" bg="#e9e9ea" size={50} t="more" />
    </div>
    <div className="flex gap-1 overflow-hidden px-2 pb-2 pt-4 text-black/80">
      <Action icon={<Flag size={21} />} label="Melden" bg="#f1f1f2" size={50} />
      <Action icon={<Heart size={21} />} label="Kein Interesse" bg="#f1f1f2" size={50} />
      <Action icon={<Download size={21} />} label="Speichern" bg="#f1f1f2" size={50} />
      <Action icon={<Users size={21} />} label="Duett" bg="#f1f1f2" size={50} />
      <Action icon={<Star size={21} />} label="Favoriten" bg="#f1f1f2" size={50} />
    </div>
    <HomeBar os={os} />
  </SheetFrame>
);

/* ───────────── Facebook ───────────── */

const FB_BLUE = '#0866FF';

export const FacebookFeed: React.FC<SceneProps> = ({ os }) => (
  <Screen>
    <StatusBar os={os} />
    <div className="flex items-center justify-between px-4 pb-2 pt-1">
      <span className="text-[30px] font-bold tracking-[-0.04em]" style={{ color: FB_BLUE, fontFamily: 'Helvetica, Arial, sans-serif' }}>facebook</span>
      <span className="flex gap-2.5">
        {[<Plus key="p" size={21} />, <Search key="s" size={21} />, <SiMessenger key="m" size={19} />].map((icon, i) => (
          <span key={i} className="flex size-10 items-center justify-center rounded-full bg-[#e4e6eb]">{icon}</span>
        ))}
      </span>
    </div>
    <div className="flex items-center justify-around border-b border-black/10 pb-2.5 text-[#65676b]">
      <House size={25} color={FB_BLUE} fill={FB_BLUE} /><Tv size={25} /><Users size={25} /><Store size={25} /><Bell size={25} /><Menu size={25} />
    </div>
    <div className="h-2 flex-none bg-[#c9ccd1]" />
    <div className="flex items-center gap-2.5 px-4 pt-3">
      <Avatar size={42} i={2} />
      <div className="min-w-0 flex-1">
        <p className="text-[15.5px] font-semibold leading-tight">{POST.name}</p>
        <p className="flex items-center gap-1 text-[13px] text-[#65676b]">2 Std. · <Globe size={12} /></p>
      </div>
      <Ellipsis size={22} color="#65676b" /><X size={22} color="#65676b" className="ml-3" />
    </div>
    <p className="px-4 pb-3 pt-2.5 text-[15px] leading-snug">{POST.caption}</p>
    <img src={POST.image} alt="" className="aspect-square w-full flex-none object-cover" />
    <div className="flex items-center justify-between px-4 py-2.5 text-[13.5px] text-[#65676b]">
      <span className="flex items-center gap-1.5">
        <span className="flex -space-x-1"><span className="flex size-[19px] items-center justify-center rounded-full border-2 border-white" style={{ background: FB_BLUE }}><ThumbsUp size={10} fill="#fff" color="#fff" /></span><span className="flex size-[19px] items-center justify-center rounded-full border-2 border-white bg-[#f33e58]"><Heart size={10} fill="#fff" color="#fff" /></span></span>
        1.284
      </span>
      <span>312 Kommentare · 96 Mal geteilt</span>
    </div>
    <div className="mx-4 flex items-center justify-around border-t border-black/10 py-2 text-[14.5px] font-semibold text-[#65676b]">
      <span className="flex items-center gap-2"><ThumbsUp size={20} />Gefällt mir</span>
      <span className="flex items-center gap-2"><MessageCircle size={20} />Kommentieren</span>
      <span {...target('share')} className="flex items-center gap-2"><Forward size={21} />Teilen</span>
    </div>
  </Screen>
);

export const FacebookSheet: React.FC<SheetProps> = ({ os, open }) => (
  <SheetFrame open={open} radius={14}>
    <Grab />
    <div className="flex items-center gap-3 px-4">
      <Avatar size={42} i={5} />
      <div>
        <p className="text-[15px] font-semibold">Du</p>
        <div className="mt-1 flex gap-1.5 text-[12.5px] font-semibold text-[#050505]">
          <span className="flex items-center gap-1 rounded-md bg-[#e4e6eb] px-2 py-0.5">Feed</span>
          <span className="flex items-center gap-1 rounded-md bg-[#e4e6eb] px-2 py-0.5"><Globe size={12} />Öffentlich</span>
        </div>
      </div>
    </div>
    <p className="px-4 pb-8 pt-4 text-[17px] text-[#65676b]">Sag etwas dazu …</p>
    <div className="flex justify-end px-4 pb-4">
      <span className="rounded-md px-5 py-2 text-[15px] font-semibold text-white" style={{ background: FB_BLUE }}>Jetzt teilen</span>
    </div>
    <p className="border-t border-black/10 px-4 pb-1 pt-3 text-[17px] font-bold">Senden mit</p>
    <div className="flex gap-1 overflow-hidden px-2 pt-3">
      <Action icon={<SiMessenger size={26} />} label="Messenger" bg="linear-gradient(45deg,#0a7cff,#a334fa,#ff6968)" color="#fff" size={52} />
      <Action icon={<SiWhatsapp size={27} />} label="WhatsApp" bg="#25D366" color="#fff" size={52} />
      <Action icon={<Link size={23} />} label="Link kopieren" bg="#e4e6eb" size={52} />
      <Action icon={<Users size={23} />} label="Gruppe" bg="#e4e6eb" size={52} />
      <Action icon={<Ellipsis size={24} />} label="Mehr Optionen" bg="#e4e6eb" size={52} t="more" />
    </div>
    <HomeBar os={os} />
  </SheetFrame>
);

/* ───────────── Web (Safari auf iOS, Chrome auf Android) ───────────── */

const RecipePage: React.FC = () => (
  <div className="flex-1 overflow-hidden bg-white">
    <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
      <span className="text-[19px] font-black tracking-tight text-[#c0392b]">lecker<span className="text-[#333]">kochen</span></span>
      <Menu size={24} />
    </div>
    <img src={POST.image} alt="" className="aspect-[4/3] w-full object-cover" />
    <div className="px-4 pt-4">
      <h1 className="text-[25px] font-extrabold leading-tight">{POST.pageTitle}</h1>
      <p className="mt-1.5 flex items-center gap-1 text-[14px] text-[#e0a100]">★★★★★ <span className="text-[#666]">(128 Bewertungen)</span></p>
      <p className="mt-2 text-[14px] text-[#666]">30 Min · einfach · 2 Portionen</p>
      <h2 className="mt-4 text-[18px] font-bold">Zutaten</h2>
      <ul className="mt-1.5 space-y-1.5 text-[15px]">
        {['4 Eier', '1 Dose Tomaten', '1 rote Paprika', '1 Zwiebel', '100 g Feta'].map((z) => (
          <li key={z} className="border-b border-black/5 pb-1.5">{z}</li>
        ))}
      </ul>
    </div>
  </div>
);

export const WebFeed: React.FC<SceneProps> = ({ os }) =>
  os === 'ios' ? (
    <Screen>
      <StatusBar os={os} />
      <RecipePage />
      <div className="flex-none border-t border-black/10 bg-[#f6f6f6]/95 px-3 pt-2.5">
        <div className="flex h-11 items-center justify-between rounded-xl bg-white px-3 text-[15px] shadow-sm">
          <span className="text-[13px] font-semibold">AA</span>
          <span className="flex items-center gap-1"><Lock size={12} />{POST.host}</span>
          <RotateCw size={16} />
        </div>
        <div className="flex items-center justify-between px-3 pb-1 pt-3 text-[#0a84ff]">
          <ChevronLeft size={27} /><ChevronRight size={27} className="opacity-35" />
          <span {...target('share')} className="flex size-10 items-center justify-center"><Share size={25} /></span>
          <BookOpen size={25} /><Copy size={24} />
        </div>
        <HomeBar os={os} />
      </div>
    </Screen>
  ) : (
    <Screen>
      <StatusBar os={os} />
      <div className="flex flex-none items-center gap-2 border-b border-black/10 px-2.5 pb-2.5 pt-1">
        <House size={22} color="#444" />
        <div className="flex h-11 flex-1 items-center gap-2 rounded-full bg-[#eef1f6] px-3.5 text-[15px] text-[#202124]">
          <SlidersHorizontal size={16} />{POST.host}
        </div>
        <span className="flex size-6 items-center justify-center rounded-[5px] border-2 border-[#444] text-[11px] font-bold text-[#444]">2</span>
        <span {...target('share')} className="flex size-9 items-center justify-center"><EllipsisVertical size={22} color="#444" /></span>
      </div>
      <RecipePage />
      <HomeBar os={os} />
    </Screen>
  );

/** Chrome-Menü (nur Android): Tipp auf ⋮ öffnet es, „Teilen…“ führt zum System-Blatt. */
export const ChromeMenu: React.FC<SheetProps> = ({ open }) => (
  <div
    className="absolute right-2 top-[44px] z-20 w-[250px] origin-top-right rounded-2xl bg-white py-2 text-[15.5px] text-[#202124] shadow-[0_8px_28px_rgba(0,0,0,.25)] transition-[opacity,transform] duration-200"
    style={{ opacity: open ? 1 : 0, transform: open ? 'scale(1)' : 'scale(.85)', fontFamily: SYSTEM_FONT }}
  >
    <div className="flex items-center justify-around px-2 pb-2 pt-1 text-[#444]">
      <ArrowRight size={21} /><Star size={21} /><Download size={21} /><Info size={21} /><RotateCw size={21} />
    </div>
    {['Neuer Tab', 'Neuer Inkognito-Tab', 'Verlauf', 'Downloads', 'Lesezeichen', 'Zuletzt verwendete Tabs'].map((item) => (
      <div key={item} className="px-5 py-2.5">{item}</div>
    ))}
    <div {...target('more')} className="flex items-center gap-3 px-5 py-2.5"><Share2 size={19} color="#444" />Teilen …</div>
    {['Auf Seite suchen', 'Übersetzen …', 'Desktopwebsite'].map((item) => (
      <div key={item} className="px-5 py-2.5">{item}</div>
    ))}
  </div>
);
