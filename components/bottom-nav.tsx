import Link from "next/link";
import { MessageCircle, Receipt, PieChart, User } from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "chat" | "bills" | "stats" | "profile";

const tabs: { key: TabKey; href: string; icon: typeof MessageCircle; label: string }[] = [
  { key: "chat", href: "/", icon: MessageCircle, label: "记账" },
  { key: "bills", href: "/bills", icon: Receipt, label: "账单" },
  { key: "stats", href: "/stats", icon: PieChart, label: "统计" },
  { key: "profile", href: "/profile", icon: User, label: "我的" },
];

export function BottomNav({ active }: { active: TabKey }) {
  return (
    <nav className="fixed bottom-0 left-1/2 z-30 flex h-16 w-full max-w-[480px] -translate-x-1/2 items-center border-t border-white/5 bg-[#0B0D17]/80 backdrop-blur-xl">
      {tabs.map((t) => {
        const isActive = t.key === active;
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] transition",
              isActive ? "font-semibold text-indigo-300" : "text-slate-500 hover:text-slate-300"
            )}
          >
            <Icon className={cn("h-5 w-5", isActive && "glow-ico")} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
