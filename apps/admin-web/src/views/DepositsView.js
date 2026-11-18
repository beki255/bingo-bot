import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { adminFetch } from "../api";
export const DepositsView = () => {
    const [deposits, setDeposits] = useState([]);
    const [statusFilter, setStatusFilter] = useState("PENDING");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedDeposit, setSelectedDeposit] = useState(null);
    const [rejectReason, setRejectReason] = useState("");
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const fetchDeposits = async () => {
        setIsLoading(true);
        try {
            const res = await adminFetch(`/api/admin/deposits?status=${statusFilter}`);
            if (res.ok) {
                setDeposits(res.deposits || []);
            }
        }
        catch { }
        setIsLoading(false);
    };
    useEffect(() => {
        fetchDeposits();
    }, [statusFilter]);
    const showToast = (message, type = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };
    const handleApprove = async (id) => {
        if (!confirm("Are you sure you want to approve this deposit and credit the player's wallet?"))
            return;
        setActionLoading(true);
        try {
            const res = await adminFetch(`/api/admin/deposits/${id}/approve`, {
                method: "POST",
                body: JSON.stringify({}),
            });
            if (res.ok) {
                showToast("Deposit approved successfully! Player notified on Telegram.");
                fetchDeposits();
            }
        }
        catch (err) {
            showToast(err.message || "Failed to approve deposit", "error");
        }
        finally {
            setActionLoading(false);
        }
    };
    const handleRejectSubmit = async () => {
        if (!selectedDeposit)
            return;
        setActionLoading(true);
        try {
            const res = await adminFetch(`/api/admin/deposits/${selectedDeposit.id}/reject`, {
                method: "POST",
                body: JSON.stringify({ reason: rejectReason.trim() || "Invalid transaction reference" }),
            });
            if (res.ok) {
                showToast("Deposit marked as rejected. Player notified on Telegram.");
                setSelectedDeposit(null);
                setRejectReason("");
                fetchDeposits();
            }
        }
        catch (err) {
            showToast(err.message || "Failed to reject deposit", "error");
        }
        finally {
            setActionLoading(false);
        }
    };
    return (_jsxs("div", { className: "p-8 flex flex-col gap-6 animate-fadeIn", children: [toast && (_jsx("div", { className: `fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold border ${toast.type === "success"
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : "bg-rose-500/20 border-rose-500/40 text-rose-300"}`, children: _jsx("span", { children: toast.message }) })), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "flex items-center gap-2 bg-[#0f1422] p-1.5 rounded-2xl border border-[#1a233b]", children: ["PENDING", "APPROVED", "REJECTED", "ALL"].map((st) => (_jsx("button", { onClick: () => setStatusFilter(st), className: `px-4 py-2 rounded-xl text-xs font-bold transition ${statusFilter === st
                                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                                : "text-gray-400 hover:text-gray-200"}`, children: st }, st))) }), _jsxs("span", { className: "text-xs font-semibold text-gray-400", children: ["Showing ", _jsx("b", { children: deposits.length }), " records"] })] }), _jsx("div", { className: "bg-[#0f1422] border border-[#1a233b] rounded-2xl overflow-hidden shadow-xl", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-sm", children: [_jsx("thead", { className: "bg-[#0a0e18] text-gray-400 text-[11px] font-black uppercase tracking-wider border-b border-[#1a233b]", children: _jsxs("tr", { children: [_jsx("th", { className: "py-4 px-6", children: "Player" }), _jsx("th", { className: "py-4 px-6", children: "Amount" }), _jsx("th", { className: "py-4 px-6", children: "Provider / Acc" }), _jsx("th", { className: "py-4 px-6", children: "Transaction Ref" }), _jsx("th", { className: "py-4 px-6", children: "Date" }), _jsx("th", { className: "py-4 px-6", children: "Status" }), _jsx("th", { className: "py-4 px-6 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-[#1a233b]", children: isLoading ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "py-12 text-center text-xs text-gray-500", children: "Loading deposits..." }) })) : deposits.length === 0 ? (_jsx("tr", { children: _jsxs("td", { colSpan: 7, className: "py-12 text-center text-xs text-gray-500", children: ["No deposits matching \"", statusFilter, "\"."] }) })) : (deposits.map((d) => (_jsxs("tr", { className: "hover:bg-[#141b2d]/50 transition", children: [_jsxs("td", { className: "py-4 px-6", children: [_jsx("span", { className: "font-bold text-white block", children: d.userName }), _jsx("span", { className: "text-xs text-gray-400 font-mono", children: d.userPhone || "No phone" })] }), _jsx("td", { className: "py-4 px-6", children: _jsxs("span", { className: "text-base font-extrabold text-emerald-400 block font-mono", children: ["+", d.amount, " ETB"] }) }), _jsxs("td", { className: "py-4 px-6", children: [_jsx("span", { className: "font-semibold text-gray-200 block", children: d.provider }), d.accountNumber && (_jsx("span", { className: "text-[11px] text-gray-500 font-mono", children: d.accountNumber }))] }), _jsx("td", { className: "py-4 px-6 font-mono text-xs text-cyan-300", children: _jsx("code", { children: d.transactionRef }) }), _jsx("td", { className: "py-4 px-6 text-xs text-gray-400", children: new Date(d.createdAt).toLocaleString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            }) }), _jsx("td", { className: "py-4 px-6", children: _jsx("span", { className: `inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${d.status === "PENDING"
                                                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                                    : d.status === "APPROVED"
                                                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                                        : "bg-rose-500/15 text-rose-400 border border-rose-500/30"}`, children: d.status }) }), _jsx("td", { className: "py-4 px-6 text-right", children: d.status === "PENDING" ? (_jsxs("div", { className: "flex items-center justify-end gap-2", children: [_jsxs("button", { onClick: () => handleApprove(d.id), disabled: actionLoading, className: "px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition disabled:opacity-50", children: [_jsx(Check, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Approve" })] }), _jsxs("button", { onClick: () => setSelectedDeposit(d), disabled: actionLoading, className: "px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white font-bold text-xs flex items-center gap-1.5 border border-rose-500/30 transition disabled:opacity-50", children: [_jsx(X, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Reject" })] })] })) : (_jsx("span", { className: "text-xs text-gray-500", children: "Completed" })) })] }, d.id)))) })] }) }) }), selectedDeposit && (_jsx("div", { className: "fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4", children: _jsxs("div", { className: "bg-[#0f1422] border border-[#1a233b] rounded-3xl p-6 w-full max-w-md shadow-2xl", children: [_jsx("h3", { className: "text-lg font-black text-white mb-2", children: "Reject Deposit Request" }), _jsxs("p", { className: "text-xs text-gray-400 mb-4", children: ["Rejecting deposit of ", _jsxs("b", { children: [selectedDeposit.amount, " ETB"] }), " for ", _jsx("b", { children: selectedDeposit.userName }), ". A notification will be sent to their Telegram."] }), _jsxs("div", { className: "mb-5", children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1.5", children: "Rejection Reason (Sent to Player)" }), _jsx("textarea", { rows: 3, placeholder: "e.g. Transaction reference not found on bank statement...", value: rejectReason, onChange: (e) => setRejectReason(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-rose-500 focus:outline-none rounded-xl p-3 text-xs text-white placeholder-gray-600 transition" })] }), _jsxs("div", { className: "flex items-center justify-end gap-3", children: [_jsx("button", { onClick: () => setSelectedDeposit(null), className: "px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white", children: "Cancel" }), _jsx("button", { onClick: handleRejectSubmit, disabled: actionLoading, className: "px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition", children: actionLoading ? "Rejecting..." : "Confirm Rejection" })] })] }) }))] }));
};
