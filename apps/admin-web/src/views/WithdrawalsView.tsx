import React, { useEffect, useState } from "react";
import { Check, X, Search, Copy, Landmark } from "lucide-react";
import { adminFetch, formatDateTime, formatMoney } from "../api";
import type { AdminWithdrawalRow } from "../types";

interface WithdrawalsViewProps {
  refreshSignal: number;
  onCountsChanged: () => void;
  onManageWithdrawMethods?: () => void;
}

export const WithdrawalsView: React.FC<WithdrawalsViewProps> = ({
  refreshSignal,
  onCountsChanged,
  onManageWithdrawMethods,
}) => {
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "PAID" | "REJECTED" | "ALL">("PENDING");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<AdminWithdrawalRow | null>(null);
  const [modalMode, setModalMode] = useState<"pay" | "reject" | null>(null);
  const [payoutRef, setPayoutRef] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchWithdrawals = async () => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ status: statusFilter });
      if (search.trim()) qs.set("search", search.trim());
      const res = await adminFetch(`/api/admin/withdrawals?${qs.toString()}`);
      if (res.ok) setWithdrawals(res.withdrawals || []);
    } catch {
      // handled
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWithdrawals();
  }, [statusFilter, search, refreshSignal]);

  const copyText = (txt: string) => {
    navigator.clipboard.writeText(txt).then(() => showToast(`Copied: ${txt}`));
  };

  const handlePaySubmit = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await adminFetch(`/api/admin/withdrawals/${selected.id}/pay`, {
        method: "POST",
        body: JSON.stringify({
          payoutReference: payoutRef.trim() || "DIRECT_TRANSFER",
          note: payoutNote.trim(),
        }),
      });
      if (res.ok) {
        showToast("Payout marked PAID & player notified on Telegram!");
        setSelected(null);
        setModalMode(null);
        setPayoutRef("");
        setPayoutNote("");
        fetchWithdrawals();
        onCountsChanged();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to mark paid", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await adminFetch(`/api/admin/withdrawals/${selected.id}/reject`, {
        method: "POST",
        body: JSON.stringify({
          reason: rejectReason.trim() || "Invalid payout account details",
        }),
      });
      if (res.ok) {
        showToast("Withdrawal rejected & funds refunded to player wallet!");
        setSelected(null);
        setModalMode(null);
        setRejectReason("");
        fetchWithdrawals();
        onCountsChanged();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to reject", "error");
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

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#0f1422] p-1 rounded-xl border border-slate-200 dark:border-[#1a233b] w-fit shadow-sm">
          {(["PENDING", "PAID", "REJECTED", "ALL"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                statusFilter === st
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {onManageWithdrawMethods && (
            <button
              type="button"
              onClick={onManageWithdrawMethods}
              className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-sm shrink-0 transition"
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>Withdraw Methods</span>
            </button>
          )}
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search account, player, bank..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] focus:border-blue-500 focus:outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Cards */}
      {isLoading && withdrawals.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400 dark:text-gray-500">Loading withdrawals...</div>
      ) : withdrawals.length === 0 ? (
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-12 text-center text-xs text-slate-500 dark:text-gray-500 shadow-sm">
          No {statusFilter.toLowerCase()} withdrawal requests found.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {withdrawals.map((w) => (
            <div
              key={w.id}
              className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col gap-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 dark:text-white">{w.userName}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                        w.status === "PENDING"
                          ? "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400"
                          : w.status === "PAID"
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            : "bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {w.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5 font-medium">
                    {w.userPhone || "No phone"} • TG: {w.userTelegramId}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5">{formatDateTime(w.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black text-amber-600 dark:text-amber-400">
                    -{formatMoney(w.amount)} ETB
                  </div>
                  <div className="text-[11px] text-blue-600 dark:text-cyan-400 font-bold">{w.provider}</div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1a233b] rounded-xl p-3.5 flex flex-col gap-2 text-xs shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-gray-400 font-medium">Account Holder:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{w.accountName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-gray-400 font-medium">Account Number:</span>
                  <button
                    onClick={() => copyText(w.accountNumber)}
                    className="flex items-center gap-1.5 font-mono font-black text-blue-600 dark:text-cyan-400 hover:text-blue-700 dark:hover:text-cyan-300"
                  >
                    <span>{w.accountNumber}</span>
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {w.payoutRef && (
                  <div className="flex items-center justify-between border-t border-slate-200 dark:border-[#161f35] pt-2">
                    <span className="text-slate-600 dark:text-gray-400 font-medium">Payout Ref:</span>
                    <code className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{w.payoutRef}</code>
                  </div>
                )}
              </div>

              {w.status === "PENDING" ? (
                <div className="flex items-center gap-3 pt-1">
                  <button
                    disabled={actionLoading}
                    onClick={() => {
                      setSelected(w);
                      setModalMode("pay");
                      setPayoutRef("");
                      setPayoutNote("");
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
                  >
                    <Check className="w-4 h-4" />
                    <span>Mark Paid</span>
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => {
                      setSelected(w);
                      setModalMode("reject");
                      setRejectReason("");
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-600 border border-rose-500/30 text-rose-600 hover:text-white dark:bg-rose-600/20 dark:text-rose-300 text-xs font-extrabold flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    <span>Reject &amp; Refund</span>
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 dark:text-gray-400 border-t border-slate-200 dark:border-[#1a233b] pt-2.5 flex items-center justify-between">
                  <span>Reviewed by: <b className="text-slate-800 dark:text-white">{w.reviewedBy || "System"}</b></span>
                  {w.reviewNote && <span className="text-slate-600 dark:text-gray-300">Note: {w.reviewNote}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: Mark Paid */}
      {selected && modalMode === "pay" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1e2742] rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 dark:text-white mb-1">Confirm Payout Transfer</h3>
            <p className="text-xs text-slate-600 dark:text-gray-400 mb-4">
              Send <b className="text-slate-900 dark:text-white">{formatMoney(selected.amount)} ETB</b> to <b className="text-slate-900 dark:text-white">{selected.accountName}</b> ({selected.provider}:{" "}
              <code className="text-blue-600 dark:text-cyan-400 font-bold">{selected.accountNumber}</code>)
            </p>
            <div className="flex flex-col gap-3 mb-5">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-gray-300 block mb-1">
                  Bank / Telebirr Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. FT243198234"
                  value={payoutRef}
                  onChange={(e) => setPayoutRef(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-gray-300 block mb-1">
                  Internal Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Paid from main Telebirr"
                  value={payoutNote}
                  onChange={(e) => setPayoutNote(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setModalMode(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1a233b] dark:hover:bg-[#243356] border border-slate-300 dark:border-transparent text-xs font-bold text-slate-700 dark:text-gray-300 transition"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={handlePaySubmit}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white disabled:opacity-50"
              >
                Confirm Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reject & Refund */}
      {selected && modalMode === "reject" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1e2742] rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 dark:text-white mb-1">Reject &amp; Refund Withdrawal</h3>
            <p className="text-xs text-slate-600 dark:text-gray-400 mb-4">
              The locked <b className="text-slate-900 dark:text-white">{formatMoney(selected.amount)} ETB</b> will be immediately refunded to{" "}
              <b className="text-slate-900 dark:text-white">{selected.userName}</b>&apos;s wallet.
            </p>
            <label className="text-xs font-bold text-slate-700 dark:text-gray-300 block mb-1">Rejection Reason</label>
            <input
              type="text"
              placeholder="e.g. Account number does not match name"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white mb-5 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-rose-500"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setModalMode(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1a233b] dark:hover:bg-[#243356] border border-slate-300 dark:border-transparent text-xs font-bold text-slate-700 dark:text-gray-300 transition"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={handleRejectSubmit}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white disabled:opacity-50"
              >
                Confirm Reject &amp; Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
