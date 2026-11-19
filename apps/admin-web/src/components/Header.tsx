import React from "react";
import { Menu, RefreshCw, Sun, Moon } from "lucide-react";
import type { AdminProfile } from "../types";

interface HeaderProps {
  title: string;
  subtitle: string;
  admin: AdminProfile;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenMobileMenu: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  admin,
  onRefresh,
  isRefreshing,
  onOpenMobileMenu,
  theme,
  onToggleTheme,
}) => {
  return (
    <header className="px-4 sm:px-8 py-4 border-b border-slate-200 dark:border-[#1a233b] bg-white/95 dark:bg-[#0b101d]/90 backdrop-blur flex items-center justify-between gap-4 shrink-0 transition-colors shadow-sm dark:shadow-none">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-[#131b2e] border border-slate-200 dark:border-[#1e2945] text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight truncate">
            {title}
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-gray-400 truncate">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Light / Dark Mode Toggle */}
        <button
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-100 dark:bg-[#131b2e] hover:bg-slate-200 dark:hover:bg-[#1a2540] border border-slate-200 dark:border-[#1e2945] text-xs font-bold text-slate-700 dark:text-gray-200 flex items-center gap-2 transition shadow-sm"
        >
          {theme === "dark" ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-blue-600" />
              <span className="hidden sm:inline">Dark Mode</span>
            </>
          )}
        </button>

        <button
          onClick={onRefresh}
          className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#131b2e] hover:bg-slate-200 dark:hover:bg-[#1a2540] border border-slate-200 dark:border-[#1e2945] text-xs font-bold text-slate-700 dark:text-gray-200 flex items-center gap-2 transition shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-600 dark:text-cyan-400" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#131b2e] border border-slate-200 dark:border-[#1e2945]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-bold text-slate-700 dark:text-gray-300">
            {admin.role === "SUPER_ADMIN" ? "Super Admin" : "Cashier"}
          </span>
        </div>
      </div>
    </header>
  );
};
