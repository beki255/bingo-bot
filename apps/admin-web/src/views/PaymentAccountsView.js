import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Plus, Edit2, Trash2, CheckCircle, XCircle } from "lucide-react";
import { adminFetch } from "../api";
export const PaymentAccountsView = () => {
    const [accounts, setAccounts] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [provider, setProvider] = useState("Telebirr");
    const [accountName, setAccountName] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [sortOrder, setSortOrder] = useState(0);
    const [isActive, setIsActive] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const fetchAccounts = async () => {
        setIsLoading(true);
        try {
            const res = await adminFetch("/api/admin/payment-accounts");
            if (res.ok) {
                setAccounts(res.accounts || []);
            }
        }
        catch { }
        setIsLoading(false);
    };
    useEffect(() => {
        fetchAccounts();
    }, []);
    const showToast = (message, type = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };
    const handleOpenCreate = () => {
        setEditingId(null);
        setProvider("Telebirr");
        setAccountName("");
        setAccountNumber("");
        setSortOrder(0);
        setIsActive(true);
        setIsModalOpen(true);
    };
    const handleOpenEdit = (acc) => {
        setEditingId(acc.id);
        setProvider(acc.provider);
        setAccountName(acc.accountName);
        setAccountNumber(acc.accountNumber);
        setSortOrder(acc.sortOrder);
        setIsActive(acc.isActive);
        setIsModalOpen(true);
    };
    const handleSave = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            const payload = { provider, accountName, accountNumber, sortOrder, isActive };
            if (editingId) {
                await adminFetch(`/api/admin/payment-accounts/${editingId}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                showToast("Payment account updated successfully!");
            }
            else {
                await adminFetch("/api/admin/payment-accounts", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                showToast("New payment account created successfully!");
            }
            setIsModalOpen(false);
            fetchAccounts();
        }
        catch (err) {
            showToast(err.message || "Failed to save account", "error");
        }
        finally {
            setActionLoading(false);
        }
    };
    const handleDelete = async (id) => {
        if (!confirm("Are you sure you want to delete this payment account?"))
            return;
        try {
            await adminFetch(`/api/admin/payment-accounts/${id}`, { method: "DELETE" });
            showToast("Account deleted successfully.");
            fetchAccounts();
        }
        catch (err) {
            showToast(err.message || "Failed to delete account", "error");
        }
    };
    return (_jsxs("div", { className: "p-8 flex flex-col gap-6 animate-fadeIn", children: [toast && (_jsx("div", { className: `fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold border ${toast.type === "success"
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : "bg-rose-500/20 border-rose-500/40 text-rose-300"}`, children: _jsx("span", { children: toast.message }) })), _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-base font-extrabold text-white", children: "Deposit Receiving Accounts" }), _jsx("p", { className: "text-xs text-gray-400 mt-0.5", children: "These accounts (CBE, Telebirr, etc.) are shown to players when they deposit via the bot." })] }), _jsxs("button", { onClick: handleOpenCreate, className: "px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-600/30 transition", children: [_jsx(Plus, { className: "w-4 h-4" }), _jsx("span", { children: "Add Payment Account" })] })] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5", children: isLoading ? (_jsx("div", { className: "col-span-3 py-12 text-center text-xs text-gray-500", children: "Loading accounts..." })) : accounts.length === 0 ? (_jsx("div", { className: "col-span-3 py-12 text-center text-xs text-gray-500", children: "No payment accounts registered yet. Click \"Add Payment Account\" to add CBE or Telebirr." })) : (accounts.map((acc) => (_jsxs("div", { className: "bg-[#0f1422] border border-[#1a233b] rounded-2xl p-5 shadow-xl flex flex-col justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("span", { className: "px-2.5 py-1 rounded-lg text-xs font-black bg-blue-500/10 text-cyan-400 border border-blue-500/20 uppercase tracking-wide", children: acc.provider }), acc.isActive ? (_jsxs("span", { className: "flex items-center gap-1 text-[11px] font-bold text-emerald-400", children: [_jsx(CheckCircle, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Active" })] })) : (_jsxs("span", { className: "flex items-center gap-1 text-[11px] font-bold text-rose-400", children: [_jsx(XCircle, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Disabled" })] }))] }), _jsxs("div", { className: "mb-2", children: [_jsx("span", { className: "text-[11px] text-gray-400 block", children: "Account Holder Name:" }), _jsx("span", { className: "text-sm font-extrabold text-white block", children: acc.accountName })] }), _jsxs("div", { children: [_jsx("span", { className: "text-[11px] text-gray-400 block", children: "Account / Phone Number:" }), _jsx("span", { className: "text-base font-black text-white font-mono tracking-wider block", children: acc.accountNumber })] })] }), _jsxs("div", { className: "flex items-center justify-end gap-2 pt-4 mt-4 border-t border-[#1a233b]", children: [_jsxs("button", { onClick: () => handleOpenEdit(acc), className: "px-3 py-1.5 rounded-xl bg-[#141b2d] hover:bg-[#1a233b] text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 border border-[#232d4b] transition", children: [_jsx(Edit2, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Edit" })] }), _jsxs("button", { onClick: () => handleDelete(acc.id), className: "px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white text-xs font-bold flex items-center gap-1.5 border border-rose-500/20 transition", children: [_jsx(Trash2, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Delete" })] })] })] }, acc.id)))) }), isModalOpen && (_jsx("div", { className: "fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4", children: _jsxs("div", { className: "bg-[#0f1422] border border-[#1a233b] rounded-3xl p-6 w-full max-w-md shadow-2xl", children: [_jsx("h3", { className: "text-lg font-black text-white mb-4", children: editingId ? "Edit Payment Account" : "Add New Payment Account" }), _jsxs("form", { onSubmit: handleSave, className: "flex flex-col gap-3.5", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "Provider (Bank / Wallet Name)" }), _jsx("input", { type: "text", placeholder: "e.g. Telebirr, Commercial Bank of Ethiopia (CBE), Awash", required: true, value: provider, onChange: (e) => setProvider(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 transition" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "Account Holder Full Name" }), _jsx("input", { type: "text", placeholder: "e.g. Abebe Kebede", required: true, value: accountName, onChange: (e) => setAccountName(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 transition" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "Account Number / Phone Number" }), _jsx("input", { type: "text", placeholder: "e.g. 1000123456789 or 0911223344", required: true, value: accountNumber, onChange: (e) => setAccountNumber(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 font-mono transition" })] }), _jsxs("div", { className: "flex items-center justify-between py-2 border-t border-[#1a233b] mt-1", children: [_jsx("span", { className: "text-xs font-bold text-gray-300", children: "Active for Deposits" }), _jsx("input", { type: "checkbox", checked: isActive, onChange: (e) => setIsActive(e.target.checked), className: "w-4 h-4 rounded text-blue-600 bg-[#0a0e18] border-[#1e2742] cursor-pointer" })] }), _jsxs("div", { className: "flex items-center justify-end gap-3 pt-3 border-t border-[#1a233b]", children: [_jsx("button", { type: "button", onClick: () => setIsModalOpen(false), className: "px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white", children: "Cancel" }), _jsx("button", { type: "submit", disabled: actionLoading, className: "px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition", children: actionLoading ? "Saving..." : "Save Account" })] })] })] }) }))] }));
};
