import React, { useEffect, useState } from "react";
import { ShieldCheck, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { adminFetch, formatDateTime } from "../api";
import type { AdminAuditLogRow } from "../types";

interface AuditLogsViewProps {
  refreshSignal: number;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ refreshSignal }) => {
  const [logs, setLogs] = useState<AdminAuditLogRow[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: "40" });
      if (actionFilter.trim()) qs.set("action", actionFilter.trim());
      const res = await adminFetch(`/api/admin/audit-logs?${qs.toString()}`);
      if (res.ok) {
        setLogs(res.logs || []);
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
    fetchLogs();
  }, [page, actionFilter, refreshSignal]);

  return (
    <div className="p-4 sm:p-8 flex flex-col gap-5 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>Immutable record of every admin &amp; cashier action</span>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter by action (e.g. DEPOSIT, BAN)..."
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
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
                <th className="py-3.5 px-4 font-bold">Time</th>
                <th className="py-3.5 px-4 font-bold">Actor</th>
                <th className="py-3.5 px-4 font-bold">Action</th>
                <th className="py-3.5 px-4 font-bold">Target</th>
                <th className="py-3.5 px-4 font-bold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#161e34] text-xs">
              {isLoading && logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gray-500">
                    Loading audit logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gray-500">
                    No audit entries yet.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="hover:bg-[#131b2e]/50 align-top">
                    <td className="py-3 px-4 text-[11px] text-gray-400 whitespace-nowrap">
                      {formatDateTime(l.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{l.actorName}</div>
                      <div className="text-[10px] text-cyan-400">{l.actorRole}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-lg bg-[#162038] text-amber-300 text-[10px] font-mono font-bold">
                        {l.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[11px] text-gray-300 font-mono">
                      {l.targetType}:{l.targetId.slice(0, 12)}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-gray-400 font-mono max-w-md break-all">
                      {l.afterJson ? JSON.stringify(l.afterJson) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-[#1a233b] bg-[#0b101d] flex items-center justify-between text-xs text-gray-400">
          <span>
            Total Logs: <b>{total}</b> (Page {page} of {totalPages})
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
