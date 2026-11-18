import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { LayoutDashboard, ArrowDownLeft, ArrowUpRight, Users, Building2, Gamepad2, Settings, ShieldAlert, LogOut, ChevronRight, } from "lucide-react";
export const Sidebar = ({ activeTab, onSelectTab, admin, onLogout, pendingDepositsCount = 0, pendingWithdrawalsCount = 0, }) => {
    const navItems = [
        {
            id: "dashboard",
            label: "Dashboard",
            icon: _jsx(LayoutDashboard, { className: "w-5 h-5" }),
        },
        {
            id: "deposits",
            label: "Deposits",
            icon: _jsx(ArrowDownLeft, { className: "w-5 h-5 text-emerald-400" }),
            badge: pendingDepositsCount,
        },
        {
            id: "withdrawals",
            label: "Withdrawals",
            icon: _jsx(ArrowUpRight, { className: "w-5 h-5 text-amber-400" }),
            badge: pendingWithdrawalsCount,
        },
        {
            id: "users",
            label: "Players & Wallets",
            icon: _jsx(Users, { className: "w-5 h-5 text-blue-400" }),
        },
        {
            id: "accounts",
            label: "Payment Accounts",
            icon: _jsx(Building2, { className: "w-5 h-5 text-purple-400" }),
        },
        {
            id: "rooms",
            label: "Game Rooms",
            icon: _jsx(Gamepad2, { className: "w-5 h-5 text-cyan-400" }),
        },
        {
            id: "settings",
            label: "System Settings",
            icon: _jsx(Settings, { className: "w-5 h-5 text-gray-300" }),
        },
        {
            id: "audit",
            label: "Audit Logs",
            icon: _jsx(ShieldAlert, { className: "w-5 h-5 text-rose-400" }),
        },
    ];
    return (_jsxs("aside", { className: "w-64 bg-[#0d121f] border-r border-[#1a2238] flex flex-col justify-between shrink-0 select-none", children: [_jsxs("div", { children: [_jsxs("div", { className: "h-16 flex items-center gap-3 px-6 border-b border-[#1a2238]", children: [_jsx("div", { className: "w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center font-black text-white shadow-lg shadow-blue-500/20", children: "TB" }), _jsxs("div", { children: [_jsx("span", { className: "font-extrabold text-base text-white tracking-wide block leading-none", children: "Tunnel Bingo" }), _jsx("span", { className: "text-[11px] font-semibold text-cyan-400 tracking-wider uppercase mt-1 block", children: "Admin Portal" })] })] }), _jsx("nav", { className: "p-3 flex flex-col gap-1", children: navItems.map((item) => {
                            const isActive = activeTab === item.id;
                            return (_jsxs("button", { onClick: () => onSelectTab(item.id), className: `w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${isActive
                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                                    : "text-gray-400 hover:text-gray-100 hover:bg-[#141b2d]"}`, children: [_jsxs("div", { className: "flex items-center gap-3", children: [item.icon, _jsx("span", { children: item.label })] }), item.badge !== undefined && item.badge > 0 ? (_jsx("span", { className: `px-2 py-0.5 rounded-full text-xs font-black ${isActive ? "bg-white text-blue-600" : "bg-rose-500 text-white animate-pulse"}`, children: item.badge })) : (isActive && _jsx(ChevronRight, { className: "w-4 h-4 opacity-70" }))] }, item.id));
                        }) })] }), _jsxs("div", { className: "p-4 border-t border-[#1a2238] bg-[#0a0e18]", children: [_jsx("div", { className: "flex items-center justify-between mb-3", children: _jsxs("div", { className: "overflow-hidden", children: [_jsx("span", { className: "text-xs font-bold text-white block truncate", children: admin?.firstName || "Admin" }), _jsxs("span", { className: "text-[10px] text-gray-400 block truncate", children: ["Role: ", _jsx("span", { className: "text-cyan-400 font-semibold", children: admin?.role })] })] }) }), _jsxs("button", { onClick: onLogout, className: "w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold text-rose-400 hover:text-white hover:bg-rose-500/20 border border-rose-500/20 transition", children: [_jsx(LogOut, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Sign Out" })] })] })] }));
};
