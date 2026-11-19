import React, { useEffect, useState } from "react";
import { Plus, Edit2, Trash2, CheckCircle, XCircle, Landmark } from "lucide-react";
import { adminFetch } from "../api";
import type { AdminPaymentAccountRow, AdminProfile } from "../types";

interface PaymentAccountsViewProps {
  admin: AdminProfile;
  refreshSignal: number;
}

export const PaymentAccountsView: React.FC<PaymentAccountsViewProps> = ({
  admin,
  refreshSignal,
}) => {
  const isSuperAdmin = admin.role === "SUPER_ADMIN";
  const [accounts, setAccounts] = useState<AdminPaymentAccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [provider, setProvider] = useState("Telebirr");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [instructionsAm, setInstructionsAm] = useState("");
  const [instructionsEn, setInstructionsEn] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      const res = await adminFetch("/api/admin/payment-accounts");
      if (res.ok) setAccounts(res.accounts || []);
    } catch {
      // handled
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [refreshSignal]);

  const openCreate = () => {
    setEditingId(null);
    setProvider("Telebirr");
    setAccountName("");
    setAccountNumber("");
    setInstructionsAm("");
    setInstructionsEn("");
    setSortOrder(accounts.length);
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (acc: AdminPaymentAccountRow) => {
    setEditingId(acc.id);
    setProvider(acc.provider);
    setAccountName(acc.accountName);
    setAccountNumber(acc.accountNumber);
    setInstructionsAm(acc.instructionsAm || "");
    setInstructionsEn(acc.instructionsEn || "");
    setSortOrder(acc.sortOrder);
    setIsActive(acc.isActive);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const payload = {
        provider,
        accountName,
        accountNumber,
        instructionsAm,
        instructionsEn,
        sortOrder: Number(sortOrder),
        isActive,
      };
      if (editingId) {
        await adminFetch(`/api/admin/payment-accounts/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        showToast("Payment account updated!");
      } else {
        await adminFetch("/api/admin/payment-accounts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("Payment account added!");
      }
      setModalOpen(false);
      fetchAccounts();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save account", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (acc: AdminPaymentAccountRow) => {
    if (!confirm(`Remove payment account "${acc.provider} - ${acc.accountNumber}"?`)) return;
    setActionLoading(true);
    try {
      const res = await adminFetch(`/api/admin/payment-accounts/${acc.id}`, { method: "DELETE" });
      showToast(
        res.softDisabled
          ? "Account has deposit history, so it was disabled instead of deleted."
          : "Payment account deleted."
      );
      fetchAccounts();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 flex flex-col gap-6 animate-fadeIn">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold border ${
            toast.type === "success"
              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
              : "bg-rose-500/20 border-rose-500/40 text-rose-300"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-extrabold text-white">Deposit Receiving Accounts</h3>
          <p className="text-xs text-gray-400">
            Bank accounts and Telebirr numbers displayed to players when they tap Deposit in Telegram.
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={openCreate}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-2 shadow-lg shadow-blue-600/30"
          >
            <Plus className="w-4 h-4" />
            <span>Add Account</span>
          </button>
        )}
      </div>

      {isLoading && accounts.length === 0 ? (
        <div className="py-12 text-center text-xs text-gray-500">Loading payment accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="bg-[#0f1422] border border-[#1a233b] rounded-2xl p-12 text-center text-xs text-gray-500">
          No payment receiving accounts configured yet. Add your Telebirr or CBE account to start accepting deposits!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="bg-[#0f1422] border border-[#1a233b] rounded-2xl p-5 shadow-xl flex flex-col gap-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                    <Landmark className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-white">{acc.provider}</div>
                    <div className="text-xs text-gray-400">{acc.accountName}</div>
                  </div>
                </div>
                {acc.isActive ? (
                  <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full">
                    <CheckCircle className="w-3 h-3" /> ACTIVE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-black text-gray-400 bg-slate-700/50 px-2.5 py-1 rounded-full">
                    <XCircle className="w-3 h-3" /> DISABLED
                  </span>
                )}
              </div>

              <div className="bg-[#0a0e18] border border-[#1a233b] rounded-xl p-3 font-mono text-sm font-black text-cyan-400">
                {acc.accountNumber}
              </div>

              {isSuperAdmin && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => openEdit(acc)}
                    className="flex-1 py-2 rounded-xl bg-[#162038] hover:bg-blue-600 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleDelete(acc)}
                    className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-600 text-rose-400 hover:text-white transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md bg-[#0f1422] border border-[#1e2742] rounded-2xl p-6 shadow-2xl flex flex-col gap-4"
          >
            <h3 className="text-base font-black text-white">
              {editingId ? "Edit Payment Account" : "Add Payment Account"}
            </h3>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">Provider / Bank</label>
              <input
                type="text"
                required
                placeholder="e.g. Telebirr, CBE, Bank of Abyssinia"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3.5 py-2.5 text-xs text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">Account Holder Name</label>
              <input
                type="text"
                required
                placeholder="Full recipient name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3.5 py-2.5 text-xs text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">Account / Phone Number</label>
              <input
                type="text"
                required
                placeholder="09... or 1000..."
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Sort Order</label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <span>Active</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1a233b] dark:hover:bg-[#243356] border border-slate-300 dark:border-transparent text-xs font-bold text-slate-700 dark:text-gray-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white disabled:opacity-50"
              >
                Save Account
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
