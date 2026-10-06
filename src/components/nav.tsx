"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActivity } from "@/lib/client";
import { Activity, BookOpenText, Bot, FlaskConical, Inbox, ScrollText, Sparkles, Wallet } from "lucide-react";

const items = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/approvals", label: "Approvals", icon: Inbox },
  { href: "/mandate", label: "Mandate", icon: BookOpenText },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/playground", label: "Playground", icon: FlaskConical },
  { href: "/ledger", label: "Ledger", icon: ScrollText },
  { href: "/copilot", label: "Copilot", icon: Sparkles },
  { href: "/wallet", label: "Wallet", icon: Wallet },
];

export function Nav() {
  const path = usePathname();
  const { data } = useActivity(4000);
  const pending = data?.pending.length ?? 0;
  const linked = data?.wallet.status === "linked";
  return (
    <aside className="hidden md:flex w-[232px] shrink-0 flex-col border-r border-line bg-bg-2/60 backdrop-blur px-4 py-6 sticky top-0 h-screen">
      <Link href="/" className="flex items-center gap-2.5 px-2 mb-8">
        <span className="inline-block h-7 w-7 rounded-lg bg-accent-2 shadow-[0_0_24px_rgba(122,162,255,0.45)]" />
        <span className="display text-[26px] leading-none">Mandate</span>
      </Link>
      <nav className="flex flex-col gap-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${
                active ? "bg-surface-2 text-fg" : "text-fg-2 hover:text-fg hover:bg-surface"
              }`}
            >
              <Icon size={16} strokeWidth={1.75} className={active ? "text-accent" : "text-fg-3"} />
              <span>{label}</span>
              {href === "/approvals" && pending > 0 && (
                <span className="ml-auto num text-[11px] px-1.5 py-0.5 rounded-md bg-wait/15 text-wait border border-wait/30">{pending}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-2.5 text-[12px] text-fg-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${linked ? "bg-paid" : "bg-wait"}`} />
          {linked ? "PayPal wallet linked" : "Wallet not linked"}
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          PayPal sandbox
        </div>
      </div>
    </aside>
  );
}
