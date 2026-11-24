import React from "react";
import {
  LayoutDashboard,
  BarChart3,
  ArrowDownLeft,
  ArrowUpRight,
  Users,
  Gamepad2,
  Trophy,
  ReceiptText,
  Landmark,
  Megaphone,
  Share2,
  Settings,
  ShieldCheck,
  LogOut,
  X,
} from "lucide-react";
import type { AdminProfile, AdminTab } from "../types";

interface SidebarProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  admin: AdminProfile;
  onLogout: () => void;
  pendingDepositsCount: number;
  pendingWithdrawalsCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeColor?: string;
  superAdminOnly?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  admin,
  onLogout,
  pendingDepositsCount,
  pendingWithdrawalsCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const isSuperAdmin = admin.role === "SUPER_ADMIN";

  const sections: Array<{ title: string; items: NavItem[] }> = [
    {
      title: "Operations",
      items: [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "analytics", label: "Analytics", icon: BarChart3 },
        {
          id: "deposits",
          label: "Deposits",
          icon: ArrowDownLeft,
          badge: pendingDepositsCount,
          badgeColor: "bg-emerald-500 text-slate-950",
        },
        {
          id: "withdrawals",
          label: "Withdrawals",
          icon: ArrowUpRight,
          badge: pendingWithdrawalsCount,
          badgeColor: "bg-amber-400 text-slate-950",
        },
        { id: "users", label: "Players & Staff", icon: Users },
      ],
    },
    {
      title: "Games & Finance",
      items: [
        { id: "games", label: "Bingo Rounds", icon: Trophy },
        { id: "transactions", label: "Wallet Ledger", icon: ReceiptText },
        { id: "rooms", label: "Rooms & Stakes", icon: Gamepad2 },
        { id: "accounts", label: "Payment Accounts", icon: Landmark },
      ],
    },
    {
      title: "System",
      items: [
        { id: "broadcast", label: "Broadcasts", icon: Megaphone, superAdminOnly: true },
        { id: "channel_post", label: "Channel & Group Post", icon: Share2, superAdminOnly: true },
        { id: "settings", label: "Settings & Auth", icon: Settings },
        { id: "audit", label: "Audit Logs", icon: ShieldCheck },
      ],
    },
  ];

  const handleNavClick = (tab: AdminTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const content = (
    <aside className="w-64 h-full bg-white dark:bg-[#0b101d] border-r border-slate-200 dark:border-[#1a233b] flex flex-col select-none transition-colors">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-200 dark:border-[#1a233b] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center font-black text-lg text-white shadow-lg shadow-blue-600/30">
            ZB
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-white">Zemen Bingo</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-cyan-400">
              Admin Console
            </span>
          </div>
        </div>
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-5">
        {sections.map((section) => {
          const visibleItems = section.items.filter(
            (item) => !item.superAdminOnly || isSuperAdmin
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.title}>
              <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-gray-500">
                {section.title}
              </div>
              <div className="flex flex-col gap-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                        active
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
                          : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#131b2e]"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            active
                              ? "bg-white text-blue-700"
                              : item.badgeColor || "bg-blue-500 text-white"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Logged in Admin Footer */}
      <div className="p-3 border-t border-slate-200 dark:border-[#1a233b]">
        <div className="bg-slate-50 dark:bg-[#0f1628] border border-slate-200 dark:border-[#1a233b] rounded-xl p-3 flex items-center justify-between gap-2 shadow-sm">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{admin.firstName}</div>
            <div className="text-[10px] text-slate-500 dark:text-gray-400 truncate">
              @{admin.username || admin.telegramId} •{" "}
              <span className={isSuperAdmin ? "text-amber-600 dark:text-amber-400 font-bold" : "text-blue-600 dark:text-cyan-400 font-bold"}>
                {isSuperAdmin ? "SUPER ADMIN" : "CASHIER"}
              </span>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Sign Out"
            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-gray-400 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:block h-full shrink-0">{content}</div>
      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
};
