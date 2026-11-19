import React, { useEffect, useState } from "react";
import { Eye, Trophy, ChevronLeft, ChevronRight, X } from "lucide-react";
import { adminFetch, formatDateTime, formatMoney } from "../api";
import type { AdminGameRow } from "../types";

interface GamesViewProps {
  refreshSignal: number;
}

interface GameDetail {
  id: string;
  roomNameAm: string;
  roomNameEn: string;
  stakeAmount: number;
  houseCutPercent: number;
  status: string;
  calledNumbers: number[];
  totalPot: number;
  houseCutAmount: number;
  prizePool: number;
  startedAt: string | null;
  endedAt: string | null;
  tickets: Array<{
    id: string;
    userName: string;
    userPhone: string | null;
    cartelaNumber: number;
    status: string;
    pricePaid: number;
    prizeWon: number;
  }>;
}

function ballLabel(n: number): string {
  if (n <= 15) return `B-${n}`;
  if (n <= 30) return `I-${n}`;
  if (n <= 45) return `N-${n}`;
  if (n <= 60) return `G-${n}`;
  return `O-${n}`;
}

export const GamesView: React.FC<GamesViewProps> = ({ refreshSignal }) => {
  const [games, setGames] = useState<AdminGameRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "LIVE" | "FINISHED" | "CANCELLED_REFUNDED">("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [detail, setDetail] = useState<GameDetail | null>(null);

  const fetchGames = async () => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ status: statusFilter, page: String(page), limit: "25" });
      const res = await adminFetch(`/api/admin/games?${qs.toString()}`);
      if (res.ok) {
        setGames(res.games || []);
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
    fetchGames();
  }, [statusFilter, page, refreshSignal]);

  const inspectRound = async (id: string) => {
    try {
      const res = await adminFetch(`/api/admin/games/${id}`);
      if (res.ok && res.game) setDetail(res.game);
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-4 sm:p-8 flex flex-col gap-5 animate-fadeIn">
      <div className="flex items-center gap-1.5 bg-[#0f1422] p-1 rounded-xl border border-[#1a233b] w-fit">
        {(
          [
            ["ALL", "All Rounds"],
            ["LIVE", "Live Now"],
            ["FINISHED", "Finished"],
            ["CANCELLED_REFUNDED", "Refunded"],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            onClick={() => {
              setStatusFilter(val);
              setPage(1);
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              statusFilter === val ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-[#0f1422] border border-[#1a233b] rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1a233b] text-[11px] uppercase tracking-wider text-gray-400 bg-[#0b101d]">
                <th className="py-3.5 px-4 font-bold">Room &amp; Time</th>
                <th className="py-3.5 px-4 font-bold">Status</th>
                <th className="py-3.5 px-4 font-bold">Players / Balls</th>
                <th className="py-3.5 px-4 font-bold">Pot / House Cut</th>
                <th className="py-3.5 px-4 font-bold">Winners</th>
                <th className="py-3.5 px-4 font-bold text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#161e34] text-xs">
              {isLoading && games.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-500">
                    Loading game rounds...
                  </td>
                </tr>
              ) : games.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-500">
                    No game rounds found.
                  </td>
                </tr>
              ) : (
                games.map((g) => (
                  <tr key={g.id} className="hover:bg-[#131b2e]/60 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white">
                        {g.roomNameAm} <span className="text-gray-400">({g.stakeAmount} ETB)</span>
                      </div>
                      <div className="text-[11px] text-gray-500">{formatDateTime(g.createdAt)}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          g.status === "FINISHED"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : g.status === "RUNNING"
                              ? "bg-cyan-500/20 text-cyan-300"
                              : g.status === "CANCELLED_REFUNDED"
                                ? "bg-rose-500/15 text-rose-400"
                                : "bg-amber-500/15 text-amber-400"
                        }`}
                      >
                        {g.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-white font-semibold">
                        {g.playersCount} players • {g.ticketsCount} cartelas
                      </div>
                      <div className="text-[11px] text-gray-400">{g.calledCount} / 75 balls drawn</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white">Pot: {formatMoney(g.totalPot)} ETB</div>
                      <div className="text-[11px] text-purple-400 font-bold">
                        House: +{formatMoney(g.houseCutAmount)} ETB
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {g.winners.length === 0 ? (
                        <span className="text-gray-500">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {g.winners.map((w, i) => (
                            <span key={i} className="text-emerald-400 font-bold flex items-center gap-1">
                              <Trophy className="w-3 h-3" />
                              {w.userName} (#{w.cartelaNumber}) +{formatMoney(w.prizeWon)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => inspectRound(g.id)}
                        className="p-2 rounded-lg bg-[#162038] hover:bg-blue-600 text-gray-300 hover:text-white transition"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-[#1a233b] bg-[#0b101d] flex items-center justify-between text-xs text-gray-400">
          <span>
            Total Rounds: <b>{total}</b> (Page {page} of {totalPages})
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

      {/* Round Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] bg-[#0f1422] border border-[#1e2742] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1a233b] flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-white">
                  {detail.roomNameAm} — Round Details
                </h3>
                <p className="text-[11px] text-gray-400 font-mono">ID: {detail.id}</p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="p-2 rounded-xl bg-[#162038] text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex flex-col gap-5">
              <div className="grid grid-cols-3 gap-3 bg-[#0a0e18] border border-[#1a233b] rounded-xl p-4 text-xs">
                <div>
                  <span className="text-gray-400 block">Total Pot</span>
                  <b className="text-base text-white">{formatMoney(detail.totalPot)} ETB</b>
                </div>
                <div>
                  <span className="text-gray-400 block">House Cut ({detail.houseCutPercent}%)</span>
                  <b className="text-base text-purple-400">{formatMoney(detail.houseCutAmount)} ETB</b>
                </div>
                <div>
                  <span className="text-gray-400 block">Prize Pool</span>
                  <b className="text-base text-emerald-400">{formatMoney(detail.prizePool)} ETB</b>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-extrabold text-gray-300 uppercase mb-2">
                  Called Balls ({detail.calledNumbers.length})
                </h4>
                <div className="flex flex-wrap gap-1.5 bg-[#0a0e18] border border-[#1a233b] rounded-xl p-3 max-h-36 overflow-y-auto">
                  {detail.calledNumbers.length === 0 ? (
                    <span className="text-xs text-gray-500">No balls called yet.</span>
                  ) : (
                    detail.calledNumbers.map((num, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 rounded-lg bg-[#162038] border border-[#243356] text-[11px] font-mono font-bold text-cyan-300"
                      >
                        {ballLabel(num)}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-extrabold text-gray-300 uppercase mb-2">
                  Purchased Cartelas ({detail.tickets.length})
                </h4>
                <div className="flex flex-col gap-2">
                  {detail.tickets.map((t) => (
                    <div
                      key={t.id}
                      className="bg-[#0a0e18] border border-[#1a233b] rounded-xl px-4 py-2.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <b className="text-white">{t.userName}</b>{" "}
                        <span className="text-gray-500">({t.userPhone || "No phone"})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-cyan-400 font-bold">
                          Cartela #{t.cartelaNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            t.status === "WINNER"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-slate-700/60 text-gray-300"
                          }`}
                        >
                          {t.status}
                        </span>
                        {t.prizeWon > 0 && (
                          <span className="text-emerald-400 font-black">
                            +{formatMoney(t.prizeWon)} ETB
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
