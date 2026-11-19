import React, { useEffect, useState } from "react";
import { Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { adminFetch, formatDateTime, formatMoney } from "../api";
import type { AdminTransactionRow } from "../types";

interface TransactionsViewProps {
  refreshSignal: number;
}

const TX_TYPES = [
  "ALL",
  "DEPOSIT",
  "WITHDRAW_LOCK",
  "WITHDRAW_PAID",
  "WITHDRAW_REFUND",
  "BET",
  "BET_REFUND",
  "WIN",
  "WELCOME_BONUS",
  "REFERRAL_BONUS",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "ADMIN_ADJUSTMENT",
];

export const TransactionsView: React.FC<TransactionsViewProps> = ({ refreshSignal }) => {
  const [txs, setTxs] = useState<AdminTransactionRow[]>([]);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLedger = async () => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ type: typeFilter, page: String(page), limit: "40" });
      if (search.trim()) qs.set("search", search.trim());
      const res = await adminFetch(`/api/admin/transactions?${qs.toString()}`);
      if (res.ok) {
        setTxs(res.transactions || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      }
    } catch {
      // handled
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [typeFilter, search, page, refreshSignal]);

  const exportCsv = () => {
    const header = ["Date", "Player", "Phone", "Type", "Amount (ETB)", "Balance After", "Note"];
    const rows = txs.map((t) => [
      t.createdAt,
      `"${(t.userName || "").replace(/"/g, '""')}"`,
      t.userPhone || "",
      t.type,
      t.amount,
      t.balanceAfter,
      `"${(t.note || "").replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tunnel-bingo-ledger-p${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-8 flex flex-col gap-5 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[#0f1422] border border-[#1a233b] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white"
          >
            {TX_TYPES.map((t) => (
              <option key={t} value={t}>
                Type: {t}
              </option>
            ))}
          </select>

          <button
            onClick={exportCsv}
            className="px-3.5 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-bold flex items-center gap-2 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Page CSV</span>
          </button>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search player, phone, note, ref..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-[#0f1422] border border-[#1a233b] focus:border-blue-500 focus:outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500"
          />
        </div>
      </div>

      <div className="bg-[#0f1422] border border-[#1a233b] rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1a233b] text-[11px] uppercase tracking-wider text-gray-400 bg-[#0b101d]">
                <th className="py-3.5 px-4 font-bold">Date</th>
                <th className="py-3.5 px-4 font-bold">Player</th>
                <th className="py-3.5 px-4 font-bold">Type</th>
                <th className="py-3.5 px-4 font-bold">Amount</th>
                <th className="py-3.5 px-4 font-bold">Balance After</th>
                <th className="py-3.5 px-4 font-bold">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#161e34] text-xs">
              {isLoading && txs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-500">
                    Loading ledger...
                  </td>
                </tr>
              ) : txs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-500">
                    No transactions recorded yet.
                  </td>
                </tr>
              ) : (
                txs.map((t) => {
                  const isNegative =
                    t.amount < 0 || t.type === "BET" || t.type === "WITHDRAW_LOCK" || t.type === "TRANSFER_OUT";
                  return (
                    <tr key={t.id} className="hover:bg-[#131b2e]/50">
                      <td className="py-3 px-4 text-[11px] text-gray-400 whitespace-nowrap">
                        {formatDateTime(t.createdAt)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{t.userName}</div>
                        <div className="text-[10px] text-gray-500">{t.userPhone || "—"}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-lg bg-[#162038] text-cyan-300 text-[10px] font-black">
                          {t.type}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 font-mono font-black ${
                          isNegative ? "text-rose-400" : "text-emerald-400"
                        }`}
                      >
                        {t.amount >= 0 && !isNegative ? "+" : ""}
                        {formatMoney(t.amount)} ETB
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-200">
                        {formatMoney(t.balanceAfter)} ETB
                      </td>
                      <td className="py-3 px-4 text-gray-400 max-w-xs truncate">{t.note || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-[#1a233b] bg-[#0b101d] flex items-center justify-between text-xs text-gray-400">
          <span>
            Total Records: <b>{total}</b> (Page {page} of {totalPages})
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg bg-[#162038] text-white disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg bg-[#162038] text-white disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
