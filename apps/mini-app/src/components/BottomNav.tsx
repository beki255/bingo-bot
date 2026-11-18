import React from "react";
import { Gamepad2, History, Wallet, User } from "lucide-react";

export type TabType = "game" | "history" | "wallet" | "profile";

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: "game" as TabType, label: "Game", icon: Gamepad2 },
    { id: "history" as TabType, label: "History", icon: History },
    { id: "wallet" as TabType, label: "Wallet", icon: Wallet },
    { id: "profile" as TabType, label: "Profile", icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0f1124]/95 backdrop-blur-lg border-t border-white/10 px-4 py-2 pb-safe">
      <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-gradient-to-b from-blue-600/30 to-blue-500/10 text-cyan-400 shadow-inner"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-transform duration-200 ${
                  isActive ? "scale-110 text-cyan-400" : ""
                }`}
              />
              <span
                className={`text-[11px] font-medium mt-1 tracking-tight ${
                  isActive ? "font-bold text-white" : ""
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
