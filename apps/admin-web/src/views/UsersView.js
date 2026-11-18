import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Search, PlusCircle, MinusCircle, Ban } from "lucide-react";
import { adminFetch } from "../api";
export const UsersView = () => {
    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [adjustAmount, setAdjustAmount] = useState("");
    const [adjustNote, setAdjustNote] = useState("");
    const [adjustType, setAdjustType] = useState("add");
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const q = search ? `?search=${encodeURIComponent(search)}` : "";
            const res = await adminFetch(`/api/admin/users${q}`);
            if (res.ok) {
                setUsers(res.users || []);
            }
        }
        catch { }
        setIsLoading(false);
    };
    useEffect(() => {
        fetchUsers();
    }, [search]);
    const showToast = (message, type = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };
    const handleAdjustSubmit = async () => {
        if (!selectedUser)
            return;
        const val = Number(adjustAmount);
        if (!Number.isFinite(val) || val <= 0) {
            alert("Please enter a valid positive amount");
            return;
        }
        setActionLoading(true);
        try {
            const finalAmount = adjustType === "add" ? val : -val;
            const res = await adminFetch(`/api/admin/users/${selectedUser.id}/adjust-balance`, {
                method: "POST",
                body: JSON.stringify({
                    amount: finalAmount,
                    note: adjustNote.trim() || `Admin manual adjustment (${adjustType})`,
                }),
            });
            if (res.ok) {
                showToast(`Balance updated successfully! New balance: ${res.newBalance} ETB`);
                setSelectedUser(null);
                setAdjustAmount("");
                setAdjustNote("");
                fetchUsers();
            }
        }
        catch (err) {
            showToast(err.message || "Failed to adjust balance", "error");
        }
        finally {
            setActionLoading(false);
        }
    };
    const handleToggleBan = async (user) => {
        const nextState = !user.isBanned;
        if (!confirm(`Are you sure you want to ${nextState ? "BAN" : "UNBAN"} ${user.name}?`))
            return;
        try {
            const res = await adminFetch(`/api/admin/users/${user.id}/toggle-ban`, {
                method: "POST",
                body: JSON.stringify({ isBanned: nextState }),
            });
            if (res.ok) {
                showToast(`User ${nextState ? "banned" : "unbanned"} successfully.`);
                fetchUsers();
            }
        }
        catch (err) {
            showToast(err.message || "Failed to update user ban state", "error");
        }
    };
    return (_jsxs("div", { className: "p-8 flex flex-col gap-6 animate-fadeIn", children: [toast && (_jsx("div", { className: `fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold border ${toast.type === "success"
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : "bg-rose-500/20 border-rose-500/40 text-rose-300"}`, children: _jsx("span", { children: toast.message }) })), _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "relative w-80", children: [_jsx(Search, { className: "w-4 h-4 absolute left-3.5 top-3.5 text-gray-500" }), _jsx("input", { type: "text", placeholder: "Search phone, username, or ID...", value: search, onChange: (e) => setSearch(e.target.value), className: "w-full bg-[#0f1422] border border-[#1a233b] focus:border-blue-500 focus:outline-none rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 transition" })] }), _jsxs("span", { className: "text-xs font-semibold text-gray-400", children: ["Total Players: ", _jsx("b", { children: users.length })] })] }), _jsx("div", { className: "bg-[#0f1422] border border-[#1a233b] rounded-2xl overflow-hidden shadow-xl", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-sm", children: [_jsx("thead", { className: "bg-[#0a0e18] text-gray-400 text-[11px] font-black uppercase tracking-wider border-b border-[#1a233b]", children: _jsxs("tr", { children: [_jsx("th", { className: "py-4 px-6", children: "Player Name" }), _jsx("th", { className: "py-4 px-6", children: "Phone Number" }), _jsx("th", { className: "py-4 px-6", children: "Telegram ID" }), _jsx("th", { className: "py-4 px-6", children: "Wallet Balance" }), _jsx("th", { className: "py-4 px-6", children: "Games" }), _jsx("th", { className: "py-4 px-6", children: "Status" }), _jsx("th", { className: "py-4 px-6 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-[#1a233b]", children: isLoading ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "py-12 text-center text-xs text-gray-500", children: "Loading players..." }) })) : users.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "py-12 text-center text-xs text-gray-500", children: "No players found." }) })) : (users.map((u) => (_jsxs("tr", { className: "hover:bg-[#141b2d]/50 transition", children: [_jsxs("td", { className: "py-4 px-6", children: [_jsx("span", { className: "font-bold text-white block", children: u.name }), u.username && _jsxs("span", { className: "text-xs text-cyan-400", children: ["@", u.username] })] }), _jsx("td", { className: "py-4 px-6 font-mono text-xs text-gray-300", children: u.phoneNumber || _jsx("span", { className: "text-gray-600", children: "Unverified" }) }), _jsx("td", { className: "py-4 px-6 font-mono text-xs text-gray-400", children: u.telegramId }), _jsx("td", { className: "py-4 px-6", children: _jsxs("span", { className: "text-base font-extrabold text-white font-mono block", children: [u.balance, " ", _jsx("span", { className: "text-xs text-amber-400 font-bold", children: "ETB" })] }) }), _jsxs("td", { className: "py-4 px-6 text-xs text-gray-300", children: [u.totalGames, " played"] }), _jsx("td", { className: "py-4 px-6", children: u.isBanned ? (_jsx("span", { className: "inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30", children: "BANNED" })) : (_jsx("span", { className: "inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30", children: "ACTIVE" })) }), _jsx("td", { className: "py-4 px-6 text-right", children: _jsxs("div", { className: "flex items-center justify-end gap-2", children: [_jsx("button", { onClick: () => setSelectedUser(u), className: "px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white font-bold text-xs border border-blue-500/30 transition", children: "Adjust Balance" }), _jsx("button", { onClick: () => handleToggleBan(u), className: `p-1.5 rounded-xl border transition ${u.isBanned
                                                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                                                            : "bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"}`, title: u.isBanned ? "Unban user" : "Ban user", children: _jsx(Ban, { className: "w-3.5 h-3.5" }) })] }) })] }, u.id)))) })] }) }) }), selectedUser && (_jsx("div", { className: "fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4", children: _jsxs("div", { className: "bg-[#0f1422] border border-[#1a233b] rounded-3xl p-6 w-full max-w-md shadow-2xl", children: [_jsx("h3", { className: "text-lg font-black text-white mb-1", children: "Adjust Wallet Balance" }), _jsxs("p", { className: "text-xs text-gray-400 mb-4", children: ["Player: ", _jsx("b", { children: selectedUser.name }), " (Current: ", _jsxs("b", { children: [selectedUser.balance, " ETB"] }), ")"] }), _jsxs("div", { className: "bg-[#0b0f1a] p-1 rounded-xl flex items-center border border-[#1a233b] mb-4", children: [_jsxs("button", { type: "button", onClick: () => setAdjustType("add"), className: `flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${adjustType === "add"
                                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                                        : "text-gray-400 hover:text-gray-200"}`, children: [_jsx(PlusCircle, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Credit (+)" })] }), _jsxs("button", { type: "button", onClick: () => setAdjustType("deduct"), className: `flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${adjustType === "deduct"
                                        ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                                        : "text-gray-400 hover:text-gray-200"}`, children: [_jsx(MinusCircle, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Debit (-)" })] })] }), _jsxs("div", { className: "flex flex-col gap-3 mb-5", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "Amount in ETB" }), _jsx("input", { type: "number", placeholder: "e.g. 50 or 100", value: adjustAmount, onChange: (e) => setAdjustAmount(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 transition" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "Reason / Reference Note" }), _jsx("input", { type: "text", placeholder: "e.g. Manual bank deposit, bonus correction...", value: adjustNote, onChange: (e) => setAdjustNote(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 transition" })] })] }), _jsxs("div", { className: "flex items-center justify-end gap-3", children: [_jsx("button", { onClick: () => setSelectedUser(null), className: "px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white", children: "Cancel" }), _jsx("button", { onClick: handleAdjustSubmit, disabled: actionLoading, className: "px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition", children: actionLoading ? "Updating..." : "Save Balance Adjustment" })] })] }) }))] }));
};
