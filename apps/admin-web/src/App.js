import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { LoginView } from "./views/LoginView";
import { DashboardView } from "./views/DashboardView";
import { DepositsView } from "./views/DepositsView";
import { WithdrawalsView } from "./views/WithdrawalsView";
import { UsersView } from "./views/UsersView";
import { PaymentAccountsView } from "./views/PaymentAccountsView";
import { RoomsView } from "./views/RoomsView";
import { SettingsView } from "./views/SettingsView";
import { AuditLogsView } from "./views/AuditLogsView";
import { getAuthToken, clearAuthToken, adminFetch } from "./api";
export default function App() {
    const [admin, setAdmin] = useState(() => {
        const raw = localStorage.getItem("bingo_admin_profile");
        if (raw && getAuthToken()) {
            try {
                return JSON.parse(raw);
            }
            catch {
                return null;
            }
        }
        return null;
    });
    const [activeTab, setActiveTab] = useState("dashboard");
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pendingDeposits, setPendingDeposits] = useState(0);
    const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
    const fetchQuickCounts = async () => {
        if (!getAuthToken())
            return;
        try {
            const res = await adminFetch("/api/admin/dashboard");
            if (res.ok && res.metrics) {
                setPendingDeposits(res.metrics.pendingDeposits);
                setPendingWithdrawals(res.metrics.pendingWithdrawals);
            }
        }
        catch { }
    };
    useEffect(() => {
        if (admin) {
            fetchQuickCounts();
            const interval = setInterval(fetchQuickCounts, 15000);
            return () => clearInterval(interval);
        }
    }, [admin]);
    useEffect(() => {
        const handleAuthExpired = () => {
            setAdmin(null);
        };
        window.addEventListener("admin_auth_expired", handleAuthExpired);
        return () => window.removeEventListener("admin_auth_expired", handleAuthExpired);
    }, []);
    const handleLogout = () => {
        clearAuthToken();
        setAdmin(null);
    };
    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchQuickCounts();
        setTimeout(() => setIsRefreshing(false), 500);
    };
    if (!admin) {
        return _jsx(LoginView, { onSuccess: (user) => setAdmin(user) });
    }
    const titles = {
        dashboard: { title: "Operations Dashboard", subtitle: "Real-time system overview & financial metrics" },
        deposits: { title: "Deposit Approvals Queue", subtitle: "Verify player receipts and approve wallet credits" },
        withdrawals: { title: "Withdrawal Payouts Queue", subtitle: "Process player payout requests and record confirmations" },
        users: { title: "Players & Wallets Management", subtitle: "Search players, adjust balances, and manage account statuses" },
        accounts: { title: "Payment Receiving Accounts", subtitle: "Manage bank accounts and mobile wallets shown to players" },
        rooms: { title: "Bingo Rooms & Stakes", subtitle: "Configure game stakes, commission cuts, and countdown timers" },
        settings: { title: "System Settings", subtitle: "Configure bonuses, financial limits, and maintenance mode" },
        audit: { title: "System Audit Logs", subtitle: "Full immutable log of administrative actions" },
    };
    return (_jsxs("div", { className: "flex h-screen w-screen overflow-hidden bg-[#080b12] text-white", children: [_jsx(Sidebar, { activeTab: activeTab, onSelectTab: setActiveTab, admin: admin, onLogout: handleLogout, pendingDepositsCount: pendingDeposits, pendingWithdrawalsCount: pendingWithdrawals }), _jsxs("div", { className: "flex-1 flex flex-col min-w-0 overflow-hidden", children: [_jsx(Header, { title: titles[activeTab].title, subtitle: titles[activeTab].subtitle, admin: admin, onRefresh: handleRefresh, isRefreshing: isRefreshing }), _jsxs("main", { className: "flex-1 overflow-y-auto", children: [activeTab === "dashboard" && _jsx(DashboardView, { onNavigate: setActiveTab }), activeTab === "deposits" && _jsx(DepositsView, {}), activeTab === "withdrawals" && _jsx(WithdrawalsView, {}), activeTab === "users" && _jsx(UsersView, {}), activeTab === "accounts" && _jsx(PaymentAccountsView, {}), activeTab === "rooms" && _jsx(RoomsView, {}), activeTab === "settings" && _jsx(SettingsView, {}), activeTab === "audit" && _jsx(AuditLogsView, {})] })] })] }));
}
