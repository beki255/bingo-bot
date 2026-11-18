import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { adminFetch } from "../api";
export const WithdrawalsView = () => {
    const [withdrawals, setWithdrawals] = useState([]);
    const [statusFilter, setStatusFilter] = useState("PENDING");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
    const [modalType, setModalType] = useState(null);
    const [payoutRef, setPayoutRef] = useState("");
    const [payoutNote, setPayoutNote] = useState("");
    const [rejectReason, setRejectReason] = useState("");
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const fetchWithdrawals = async () => {
        setIsLoading(true);
        try {
            const res = await adminFetch(`/api/admin/withdrawals?status=${statusFilter}`);
            if (res.ok) {
                setWithdrawals(res.withdrawals || []);
            }
        }
        catch { }
        setIsLoading(false);
    };
    useEffect(() => {
        fetchWithdrawals();
    }, [statusFilter]);
    const showToast = (message, type = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };
    const handlePaySubmit = async () => {
        if (!selectedWithdrawal)
            return;
        setActionLoading(true);
        try {
            const res = await adminFetch(`/api/admin/withdrawals/${selectedWithdrawal.id}/pay`, {
                method: "POST",
                body: JSON.stringify({
                    payoutReference: payoutRef.trim() || "DIRECT_TRANSFER",
                    note: payoutNote.trim(),
                }),
            });
            if (res.ok) {
                showToast("Payout marked as completed! Player notified on Telegram.");
                setSelectedWithdrawal(null);
                setModalType(null);
                setPayoutRef("");
                setPayoutNote("");
                fetchWithdrawals();
            }
        }
        catch (err) {
            showToast(err.message || "Failed to confirm payout", "error");
        }
        finally {
            setActionLoading(false);
        }
    };
    const handleRejectSubmit = async () => {
        if (!selectedWithdrawal)
            return;
        setActionLoading(true);
        try {
            const res = await adminFetch(`/api/admin/withdrawals/${selectedWithdrawal.id}/reject`, {
                method: "POST",
                body: JSON.stringify({
                    reason: rejectReason.trim() || "Account details invalid / Cancelled",
                }),
            });
            if (res.ok) {
                showToast("Withdrawal rejected and refunded back to player wallet.");
                setSelectedWithdrawal(null);
                setModalType(null);
                setRejectReason("");
                fetchWithdrawals();
            }
        }
        catch (err) {
            showToast(err.message || "Failed to reject withdrawal", "error");
        }
        finally {
            setActionLoading(false);
        }
    };
    return (_jsxs("div", { className: "p-8 flex flex-col gap-6 animate-fadeIn", children: [toast && (_jsx("div", { className: `fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold border ${toast.type === "success"
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : "bg-rose-500/20 border-rose-500/40 text-rose-300"}`, children: _jsx("span", { children: toast.message }) })), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "flex items-center gap-2 bg-[#0f1422] p-1.5 rounded-2xl border border-[#1a233b]", children: ["PENDING", "PAID", "REJECTED", "ALL"].map((st) => (_jsx("button", { onClick: () => setStatusFilter(st), className: `px-4 py-2 rounded-xl text-xs font-bold transition ${statusFilter === st
                                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                                : "text-gray-400 hover:text-gray-200"}`, children: st }, st))) }), _jsxs("span", { className: "text-xs font-semibold text-gray-400", children: ["Showing ", _jsx("b", { children: withdrawals.length }), " records"] })] }), _jsx("div", { className: "bg-[#0f1422] border border-[#1a233b] rounded-2xl overflow-hidden shadow-xl", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-sm", children: [_jsx("thead", { className: "bg-[#0a0e18] text-gray-400 text-[11px] font-black uppercase tracking-wider border-b border-[#1a233b]", children: _jsxs("tr", { children: [_jsx("th", { className: "py-4 px-6", children: "Player" }), _jsx("th", { className: "py-4 px-6", children: "Amount" }), _jsx("th", { className: "py-4 px-6", children: "Payout Method" }), _jsx("th", { className: "py-4 px-6", children: "Account Holder" }), _jsx("th", { className: "py-4 px-6", children: "Account / Phone" }), _jsx("th", { className: "py-4 px-6", children: "Status" }), _jsx("th", { className: "py-4 px-6 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-[#1a233b]", children: isLoading ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "py-12 text-center text-xs text-gray-500", children: "Loading payout requests..." }) })) : withdrawals.length === 0 ? (_jsx("tr", { children: _jsxs("td", { colSpan: 7, className: "py-12 text-center text-xs text-gray-500", children: ["No withdrawals matching \"", statusFilter, "\"."] }) })) : (withdrawals.map((w) => (_jsxs("tr", { className: "hover:bg-[#141b2d]/50 transition", children: [_jsxs("td", { className: "py-4 px-6", children: [_jsx("span", { className: "font-bold text-white block", children: w.userName }), _jsx("span", { className: "text-xs text-gray-400 font-mono", children: w.userPhone || "No phone" })] }), _jsx("td", { className: "py-4 px-6", children: _jsxs("span", { className: "text-base font-extrabold text-amber-400 block font-mono", children: [w.amount, " ETB"] }) }), _jsx("td", { className: "py-4 px-6", children: _jsx("span", { className: "font-semibold text-white px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs", children: w.provider }) }), _jsx("td", { className: "py-4 px-6 font-bold text-gray-200", children: w.accountName }), _jsx("td", { className: "py-4 px-6 font-mono text-xs text-cyan-300 font-bold", children: w.accountNumber }), _jsx("td", { className: "py-4 px-6", children: _jsx("span", { className: `inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${w.status === "PENDING"
                                                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                                    : w.status === "PAID"
                                                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                                        : "bg-rose-500/15 text-rose-400 border border-rose-500/30"}`, children: w.status }) }), _jsx("td", { className: "py-4 px-6 text-right", children: w.status === "PENDING" ? (_jsxs("div", { className: "flex items-center justify-end gap-2", children: [_jsxs("button", { onClick: () => {
                                                            setSelectedWithdrawal(w);
                                                            setModalType("pay");
                                                        }, className: "px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition", children: [_jsx(Check, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Mark Paid" })] }), _jsxs("button", { onClick: () => {
                                                            setSelectedWithdrawal(w);
                                                            setModalType("reject");
                                                        }, className: "px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white font-bold text-xs flex items-center gap-1.5 border border-rose-500/30 transition", children: [_jsx(X, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Reject & Refund" })] })] })) : (_jsx("span", { className: "text-xs text-gray-500 font-mono", children: w.payoutRef || "Settled" })) })] }, w.id)))) })] }) }) }), selectedWithdrawal && modalType === "pay" && (_jsx("div", { className: "fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4", children: _jsxs("div", { className: "bg-[#0f1422] border border-[#1a233b] rounded-3xl p-6 w-full max-w-md shadow-2xl", children: [_jsx("h3", { className: "text-lg font-black text-white mb-2", children: "Confirm Payout" }), _jsxs("p", { className: "text-xs text-gray-400 mb-4 leading-relaxed", children: ["Confirm you have transferred ", _jsxs("b", { children: [selectedWithdrawal.amount, " ETB"] }), " to", " ", _jsx("b", { children: selectedWithdrawal.accountName }), " via ", _jsx("b", { children: selectedWithdrawal.provider }), " (", _jsx("code", { children: selectedWithdrawal.accountNumber }), ")."] }), _jsxs("div", { className: "flex flex-col gap-3 mb-5", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "Bank / Telebirr Transaction Reference" }), _jsx("input", { type: "text", placeholder: "e.g. TX12345678 or Bank Ref", value: payoutRef, onChange: (e) => setPayoutRef(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-emerald-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 transition" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "Internal Note (Optional)" }), _jsx("input", { type: "text", placeholder: "e.g. Sent from cashier 1", value: payoutNote, onChange: (e) => setPayoutNote(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-emerald-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 transition" })] })] }), _jsxs("div", { className: "flex items-center justify-end gap-3", children: [_jsx("button", { onClick: () => {
                                        setSelectedWithdrawal(null);
                                        setModalType(null);
                                    }, className: "px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white", children: "Cancel" }), _jsx("button", { onClick: handlePaySubmit, disabled: actionLoading, className: "px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition", children: actionLoading ? "Processing..." : "Confirm Payout Complete" })] })] }) })), selectedWithdrawal && modalType === "reject" && (_jsx("div", { className: "fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4", children: _jsxs("div", { className: "bg-[#0f1422] border border-[#1a233b] rounded-3xl p-6 w-full max-w-md shadow-2xl", children: [_jsx("h3", { className: "text-lg font-black text-white mb-2", children: "Reject & Refund Withdrawal" }), _jsxs("p", { className: "text-xs text-gray-400 mb-4", children: ["Rejecting this request will immediately refund ", _jsxs("b", { children: [selectedWithdrawal.amount, " ETB"] }), " back into the player's wallet and notify them on Telegram."] }), _jsxs("div", { className: "mb-5", children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "Reason for Rejection" }), _jsx("textarea", { rows: 3, placeholder: "e.g. Bank account name does not match, or number invalid...", value: rejectReason, onChange: (e) => setRejectReason(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-rose-500 focus:outline-none rounded-xl p-3 text-xs text-white placeholder-gray-600 transition" })] }), _jsxs("div", { className: "flex items-center justify-end gap-3", children: [_jsx("button", { onClick: () => {
                                        setSelectedWithdrawal(null);
                                        setModalType(null);
                                    }, className: "px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white", children: "Cancel" }), _jsx("button", { onClick: handleRejectSubmit, disabled: actionLoading, className: "px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition", children: actionLoading ? "Rejecting..." : "Confirm Rejection & Refund" })] })] }) }))] }));
};
