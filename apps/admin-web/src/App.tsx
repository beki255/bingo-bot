import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { LoginView } from "./views/LoginView";
import { DashboardView } from "./views/DashboardView";
import { DepositsView } from "./views/DepositsView";
import { WithdrawalsView } from "./views/WithdrawalsView";
import { UsersView } from "./views/UsersView";
import { GamesView } from "./views/GamesView";
import { TransactionsView } from "./views/TransactionsView";
import { RoomsView } from "./views/RoomsView";
import { PaymentAccountsView } from "./views/PaymentAccountsView";
import { BroadcastView } from "./views/BroadcastView";
import { SettingsView } from "./views/SettingsView";
import { AuditLogsView } from "./views/AuditLogsView";
import { adminFetch, clearAuthToken, getAuthToken, API_BASE } from "./api";
import type { AdminProfile, AdminTab } from "./types";

const TAB_META: Record<AdminTab, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Operations Dashboard",
    subtitle: "Real-time system overview, cashflow, and live rooms",
  },
  deposits: {
    title: "Deposit Approvals Queue",
    subtitle: "Inspect Telegram payment screenshots and credit player wallets",
  },
  withdrawals: {
    title: "Withdrawal Payouts Queue",
    subtitle: "Process player payout requests and record bank/Telebirr references",
  },
  users: {
    title: "Players & Staff Management",
    subtitle: "Full directory, wallet history, manual adjustments, bans, and staff roles",
  },
  games: {
    title: "Bingo Rounds & Live Monitor",
    subtitle: "Inspect live & past rounds, pots, house commission, balls, and winners",
  },
  transactions: {
    title: "Global Wallet Ledger",
    subtitle: "Filter every credit, bet, win, transfer, and export to CSV",
  },
  rooms: {
    title: "Bingo Rooms & Stakes",
    subtitle: "Create and configure stakes, commission %, timers, and patterns",
  },
  accounts: {
    title: "Payment Receiving Accounts",
    subtitle: "Manage Telebirr and bank accounts shown to players on Deposit",
  },
  broadcast: {
    title: "Telegram Broadcast Center",
    subtitle: "Send mass announcements directly to players via @tunnel_bingo_bot",
  },
  settings: {
    title: "System Settings & Admin Auth",
    subtitle: "Change your admin username/password, limits, bonuses, and killswitch",
  },
  audit: {
    title: "Immutable Audit Logs",
    subtitle: "Complete history of every administrative and cashier operation",
  },
};

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("bingo_admin_theme");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
    localStorage.setItem("bingo_admin_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const [admin, setAdmin] = useState<AdminProfile | null>(() => {
    const raw = localStorage.getItem("bingo_admin_profile");
    if (raw && getAuthToken()) {
      try {
        return JSON.parse(raw) as AdminProfile;
      } catch {
        return null;
      }
    }
    return null;
  });

  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [pendingDeposits, setPendingDeposits] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);

  const fetchQuickCounts = async () => {
    if (!getAuthToken()) return;
    try {
      const res = await adminFetch("/api/admin/dashboard");
      if (res.ok && res.metrics) {
        setPendingDeposits(res.metrics.pendingDeposits || 0);
        setPendingWithdrawals(res.metrics.pendingWithdrawals || 0);
      }
    } catch {
      // handled
    }
  };

  useEffect(() => {
    if (!admin) return;
    // Validate token & refresh profile on load
    adminFetch("/api/admin/auth/me")
      .then((res) => {
        if (res.ok && res.admin) {
          localStorage.setItem("bingo_admin_profile", JSON.stringify(res.admin));
          setAdmin(res.admin);
        }
      })
      .catch(() => {});

    fetchQuickCounts();

    // Real-time socket sync with server
    const socketUrl = API_BASE || (typeof window !== "undefined" ? window.location.origin : "");
    const s = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 30,
      reconnectionDelay: 2000,
    });

    s.emit("join_admin_monitor");

    s.on("connect", () => {
      s.emit("join_admin_monitor");
      fetchQuickCounts();
      setRefreshSignal((c) => c + 1);
    });

    s.on("admin_event", () => {
      fetchQuickCounts();
      setRefreshSignal((c) => c + 1);
    });

    // Gentle 10-second polling fallback in case of network disruptions
    const interval = setInterval(fetchQuickCounts, 10000);

    return () => {
      clearInterval(interval);
      s.disconnect();
    };
  }, [admin?.id]);

  useEffect(() => {
    if (admin) {
      setRefreshSignal((c) => c + 1);
    }
  }, [activeTab]);

  useEffect(() => {
    const onExpired = () => setAdmin(null);
    window.addEventListener("admin_auth_expired", onExpired);
    return () => window.removeEventListener("admin_auth_expired", onExpired);
  }, []);

  const handleLogout = () => {
    clearAuthToken();
    setAdmin(null);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshSignal((s) => s + 1);
    await fetchQuickCounts();
    setTimeout(() => setIsRefreshing(false), 450);
  };

  if (!admin) {
    return <LoginView onSuccess={(user) => setAdmin(user)} />;
  }

  const meta = TAB_META[activeTab];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#080b12] text-slate-900 dark:text-white transition-colors">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        admin={admin}
        onLogout={handleLogout}
        pendingDepositsCount={pendingDeposits}
        pendingWithdrawalsCount={pendingWithdrawals}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title={meta.title}
          subtitle={meta.subtitle}
          admin={admin}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#080b12] transition-colors">
          {activeTab === "dashboard" && (
            <DashboardView onNavigate={setActiveTab} refreshSignal={refreshSignal} />
          )}
          {activeTab === "deposits" && (
            <DepositsView refreshSignal={refreshSignal} onCountsChanged={fetchQuickCounts} />
          )}
          {activeTab === "withdrawals" && (
            <WithdrawalsView refreshSignal={refreshSignal} onCountsChanged={fetchQuickCounts} />
          )}
          {activeTab === "users" && <UsersView admin={admin} refreshSignal={refreshSignal} />}
          {activeTab === "games" && <GamesView refreshSignal={refreshSignal} />}
          {activeTab === "transactions" && <TransactionsView refreshSignal={refreshSignal} />}
          {activeTab === "rooms" && <RoomsView admin={admin} refreshSignal={refreshSignal} />}
          {activeTab === "accounts" && (
            <PaymentAccountsView admin={admin} refreshSignal={refreshSignal} />
          )}
          {activeTab === "broadcast" && <BroadcastView />}
          {activeTab === "settings" && (
            <SettingsView admin={admin} onAdminUpdated={(next) => setAdmin(next)} />
          )}
          {activeTab === "audit" && <AuditLogsView refreshSignal={refreshSignal} />}
        </main>
      </div>
    </div>
  );
}
