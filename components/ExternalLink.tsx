import type { ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

type ExternalLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
};

export default function ExternalLink({ href, className, children }: ExternalLinkProps) {
  if (Capacitor.isNativePlatform()) {
    return (
      <a
        href={href}
        className={className}
        onClick={(event) => {
          event.preventDefault();
          void Browser.open({ url: href });
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
