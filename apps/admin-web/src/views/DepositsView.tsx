import React, { useEffect, useState } from "react";
import { Check, X, Search, Image as ImageIcon, ZoomIn } from "lucide-react";
import { adminFetch, formatDateTime, formatMoney, getTelegramFileUrl } from "../api";
import type { AdminDepositRow } from "../types";

interface DepositsViewProps {
  refreshSignal: number;
  onCountsChanged: () => void;
}

export const DepositsView: React.FC<DepositsViewProps> = ({ refreshSignal, onCountsChanged }) => {
  const [deposits, setDeposits] = useState<AdminDepositRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AdminDepositRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDeposits = async () => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ status: statusFilter });
      if (search.trim()) qs.set("search", search.trim());
      const res = await adminFetch(`/api/admin/deposits?${qs.toString()}`);
      if (res.ok) setDeposits(res.deposits || []);
    } catch {
      // handled
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeposits();
  }, [statusFilter, search, refreshSignal]);

  const handleApprove = async (dep: AdminDepositRow) => {
    if (
      !confirm(
        `Approve deposit of ${formatMoney(dep.amount)} ETB for ${dep.userName} (Ref: ${dep.transactionRef})?`
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await adminFetch(`/api/admin/deposits/${dep.id}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res.ok) {
        showToast("Deposit approved & player wallet credited!");
        fetchDeposits();
        onCountsChanged();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Approval failed", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectTarget) return;
    setActionLoading(true);
    try {
      const res = await adminFetch(`/api/admin/deposits/${rejectTarget.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason.trim() || "Invalid transaction receipt" }),
      });
      if (res.ok) {
        showToast("Deposit rejected & player notified.");
        setRejectTarget(null);
        setRejectReason("");
        fetchDeposits();
        onCountsChanged();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Rejection failed", "error");
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
        <div className="flex items-center gap-1.5 bg-[#0f1422] p-1 rounded-xl border border-[#1a233b] w-fit">
          {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                statusFilter === st
                  ? "bg-blue-600 text-white shadow"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tx ref, player, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0f1422] border border-[#1a233b] focus:border-blue-500 focus:outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500"
          />
        </div>
      </div>

      {/* Cards */}
      {isLoading && deposits.length === 0 ? (
        <div className="py-12 text-center text-xs text-gray-500">Loading deposits...</div>
      ) : deposits.length === 0 ? (
        <div className="bg-[#0f1422] border border-[#1a233b] rounded-2xl p-12 text-center text-xs text-gray-500">
          No {statusFilter.toLowerCase()} deposit requests found.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {deposits.map((dep) => {
            const imgUrl = dep.screenshotFileId ? getTelegramFileUrl(dep.screenshotFileId) : null;
            return (
              <div
                key={dep.id}
                className="bg-[#0f1422] border border-[#1a233b] rounded-2xl p-5 shadow-xl flex flex-col gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">{dep.userName}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          dep.status === "PENDING"
                            ? "bg-amber-500/20 text-amber-400"
                            : dep.status === "APPROVED"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                        }`}
                      >
                        {dep.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {dep.userPhone || "No phone"} • TG: {dep.userTelegramId}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {formatDateTime(dep.createdAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black text-emerald-400">
                      +{formatMoney(dep.amount)} ETB
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {dep.provider} ({dep.accountNumber})
                    </div>
                  </div>
                </div>

                <div className="bg-[#0a0e18] border border-[#1a233b] rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Transaction Ref:</span>
                    <code className="font-mono font-bold text-cyan-400">{dep.transactionRef}</code>
                  </div>
                  {dep.receiptText && (
                    <div className="text-[11px] text-gray-300 bg-[#0f1526] p-2.5 rounded-lg border border-[#1a233b] whitespace-pre-wrap break-words">
                      {dep.receiptText}
                    </div>
                  )}
                  {imgUrl && (
                    <div className="mt-1">
                      <button
                        type="button"
                        onClick={() => setZoomImageUrl(imgUrl)}
                        className="group relative rounded-xl overflow-hidden border border-[#1e2945] w-full max-h-56 bg-black flex items-center justify-center"
                      >
                        <img
                          src={imgUrl}
                          alt="Payment Receipt"
                          className="max-h-56 object-contain"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 text-xs font-bold text-white">
                          <ZoomIn className="w-4 h-4" />
                          <span>Click to Zoom Receipt</span>
                        </div>
                      </button>
                    </div>
                  )}
                  {!imgUrl && !dep.receiptText && (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>No screenshot image attached</span>
                    </div>
                  )}
                </div>

                {dep.status === "PENDING" ? (
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      disabled={actionLoading}
                      onClick={() => handleApprove(dep)}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>Approve &amp; Credit</span>
                    </button>
                    <button
                      disabled={actionLoading}
                      onClick={() => {
                        setRejectTarget(dep);
                        setRejectReason("");
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white text-xs font-extrabold flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400 border-t border-[#1a233b] pt-2.5 flex items-center justify-between">
                    <span>Reviewed by: <b>{dep.reviewedBy || "System"}</b></span>
                    {dep.reviewNote && <span className="text-gray-300">Note: {dep.reviewNote}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0f1422] border border-[#1e2742] rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-black text-white mb-1">Reject Deposit Request</h3>
            <p className="text-xs text-gray-400 mb-4">
              Player: <b>{rejectTarget.userName}</b> • Amount: <b>{formatMoney(rejectTarget.amount)} ETB</b>
            </p>
            <label className="text-xs font-bold text-gray-300 block mb-1.5">Rejection Reason</label>
            <input
              type="text"
              placeholder="e.g. Receipt not found in Telebirr / Duplicate ref"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-4 py-2.5 text-xs text-white mb-5"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 rounded-xl bg-[#1a233b] text-xs font-bold text-gray-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={handleRejectSubmit}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white disabled:opacity-50"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Lightbox */}
      {zoomImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomImageUrl(null)}
        >
          <img
            src={zoomImageUrl}
            alt="Full Receipt"
            className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
