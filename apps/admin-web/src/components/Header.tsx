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
    <header className="px-4 sm:px-8 py-4 border-b border-[#1a233b] bg-[#0b101d]/80 backdrop-blur flex items-center justify-between gap-4 shrink-0 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl bg-[#131b2e] border border-[#1e2945] text-gray-300 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight truncate">
            {title}
          </h2>
          <p className="text-[11px] sm:text-xs text-gray-400 truncate">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Light / Dark Mode Toggle */}
        <button
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="p-2 sm:px-3 sm:py-2 rounded-xl bg-[#131b2e] hover:bg-[#1a2540] border border-[#1e2945] text-xs font-bold text-gray-200 flex items-center gap-2 transition"
        >
          {theme === "dark" ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-cyan-500" />
              <span className="hidden sm:inline">Dark Mode</span>
            </>
          )}
        </button>

        <button
          onClick={onRefresh}
          className="px-3 py-2 rounded-xl bg-[#131b2e] hover:bg-[#1a2540] border border-[#1e2945] text-xs font-bold text-gray-200 flex items-center gap-2 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#131b2e] border border-[#1e2945]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-bold text-gray-300">
            {admin.role === "SUPER_ADMIN" ? "Super Admin" : "Cashier"}
          </span>
        </div>
      </div>
    </header>
  );
};
