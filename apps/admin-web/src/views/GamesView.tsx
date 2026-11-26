import React, { useEffect, useState, useRef } from "react";
import {
  Eye,
  Trophy,
  ChevronLeft,
  ChevronRight,
  X,
  Radio,
  Clock,
  Sparkles,
  Search,
  Calendar,
  RotateCcw,
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { adminFetch, formatDateTime, formatMoney, API_BASE } from "../api";
import type { AdminGameRow } from "../types";

interface GamesViewProps {
  refreshSignal: number;
}

const ROW_LIMIT_OPTIONS = [10, 25, 50, 100, 200] as const;
type DatePreset = "all" | "today" | "yesterday" | "7d" | "custom";

function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeTimeStr(val: string, fallback: string): string {
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:${fallback.slice(6, 8)}`;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function buildIsoBound(ymd: string, hms: string, isEnd: boolean): string | undefined {
  if (!ymd) return undefined;
  const d = new Date(`${ymd}T${hms}${isEnd ? ".999" : ".000"}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

interface GameDetail {
  id: string;
  roomId?: string;
  roomNameAm: string;
  roomNameEn: string;
  stakeAmount: number;
  houseCutPercent: number;
  status: string;
  calledNumbers: number[];
  currentBall?: { letter: string; num: number } | null;
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

function isActiveRoundStatus(status: string): boolean {
  return status === "WAITING" || status === "COUNTDOWN" || status === "RUNNING" || status === "CLAIM_WINDOW";
}

function sortGamesList(list: AdminGameRow[]): AdminGameRow[] {
  return [...list].sort((a, b) => {
    const aActive = isActiveRoundStatus(a.status);
    const bActive = isActiveRoundStatus(b.status);
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    if (aActive && bActive) {
      return (a.stakeAmount || 0) - (b.stakeAmount || 0);
    }
    const aTime = new Date(a.endedAt || a.startedAt || a.createdAt).getTime();
    const bTime = new Date(b.endedAt || b.startedAt || b.createdAt).getTime();
    return bTime - aTime;
  });
}

export const GamesView: React.FC<GamesViewProps> = ({ refreshSignal }) => {
  const [games, setGames] = useState<AdminGameRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "LIVE" | "FINISHED" | "CANCELLED_REFUNDED">("ALL");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [selectedDate, setSelectedDate] = useState<string>(() => formatLocalYmd(new Date()));
  const [toDate, setToDate] = useState<string>(() => formatLocalYmd(new Date()));
  const [fromTime, setFromTime] = useState<string>("");
  const [toTime, setToTime] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [searchScope, setSearchScope] = useState<"all" | "winner">("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(25);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [detail, setDetail] = useState<GameDetail | null>(null);

  const detailRef = useRef<GameDetail | null>(null);
  detailRef.current = detail;

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const computeTimeWindow = (cfg: {
    datePreset: DatePreset;
    selectedDate: string;
    toDate: string;
    fromTime: string;
    toTime: string;
  }): { from?: string; to?: string } => {
    const now = new Date();
    const todayYmd = formatLocalYmd(now);
    const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayYmd = formatLocalYmd(yesterdayDate);
    const weekAgoDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const weekAgoYmd = formatLocalYmd(weekAgoDate);

    const startHms = normalizeTimeStr(cfg.fromTime, "00:00:00");
    const endHms = normalizeTimeStr(cfg.toTime, "23:59:59");

    if (cfg.datePreset === "today") {
      return {
        from: buildIsoBound(todayYmd, startHms, false),
        to: buildIsoBound(todayYmd, endHms, true),
      };
    }
    if (cfg.datePreset === "yesterday") {
      return {
        from: buildIsoBound(yesterdayYmd, startHms, false),
        to: buildIsoBound(yesterdayYmd, endHms, true),
      };
    }
    if (cfg.datePreset === "7d") {
      return {
        from: buildIsoBound(weekAgoYmd, startHms, false),
        to: buildIsoBound(todayYmd, endHms, true),
      };
    }
    if (cfg.datePreset === "custom") {
      const startDay = cfg.selectedDate || todayYmd;
      const endDay = cfg.toDate || startDay;
      return {
        from: buildIsoBound(startDay, startHms, false),
        to: buildIsoBound(endDay >= startDay ? endDay : startDay, endHms, true),
      };
    }
    if (cfg.fromTime.trim() || cfg.toTime.trim()) {
      return {
        from: buildIsoBound(todayYmd, startHms, false),
        to: buildIsoBound(todayYmd, endHms, true),
      };
    }
    return {};
  };

  const filterStateRef = useRef({
    statusFilter,
    page,
    limit,
    datePreset,
    selectedDate,
    toDate,
    fromTime,
    toTime,
    debouncedSearch,
    searchScope,
  });
  filterStateRef.current = {
    statusFilter,
    page,
    limit,
    datePreset,
    selectedDate,
    toDate,
    fromTime,
    toTime,
    debouncedSearch,
    searchScope,
  };

  const fetchGames = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const f = filterStateRef.current;
      const { from, to } = computeTimeWindow(f);
      const qs = new URLSearchParams({
        status: f.statusFilter,
        page: String(f.page),
        limit: String(f.limit),
        datePreset: f.datePreset,
        searchScope: f.searchScope,
      });
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (f.debouncedSearch) qs.set("search", f.debouncedSearch);

      const res = await adminFetch(`/api/admin/games?${qs.toString()}`);
      if (res.ok) {
        setGames((prev) => {
          const freshGames: AdminGameRow[] = res.games || [];
          // Deduplicate incoming games by id
          const dedupedFresh = freshGames.filter((item, index, self) =>
            index === self.findIndex((t) => t.id === item.id)
          );
          const merged = dedupedFresh.map((fg) => {
            const existing = prev.find((p) => p.id === fg.id);
            if (existing) {
              return {
                ...fg,
                startedAt: fg.startedAt ?? existing.startedAt,
                endedAt: fg.endedAt ?? existing.endedAt,
                countdown: fg.status === "COUNTDOWN" ? existing.countdown ?? fg.countdown : undefined,
                currentBall: fg.status === "RUNNING" ? existing.currentBall ?? fg.currentBall : undefined,
                recentCalls: existing.recentCalls ?? fg.recentCalls,
              };
            }
            return fg;
          });
          return sortGamesList(merged);
        });
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      }
    } catch {
      // handled
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // Initial and param change fetch
  useEffect(() => {
    fetchGames();
  }, [
    statusFilter,
    page,
    limit,
    datePreset,
    selectedDate,
    toDate,
    fromTime,
    toTime,
    debouncedSearch,
    searchScope,
    refreshSignal,
  ]);

  // Real-time WebSocket connection to server admin monitor
  useEffect(() => {
    const socketUrl = API_BASE || (typeof window !== "undefined" ? window.location.origin : "");
    const s: Socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
    });

    s.on("connect", () => {
      setIsSocketConnected(true);
      s.emit("join_admin_monitor");
    });

    s.on("disconnect", () => {
      setIsSocketConnected(false);
    });

    // 1. Full room state snapshot broadcast
    s.on("admin_room_state", ({ roomId, state }: { roomId: string; state: any }) => {
      if (!state) return;

      setGames((prev) => {
        let matched = false;
        // Only target the specific active round, never overwrite historical finished rounds
        const next = prev.map((g) => {
          const isTarget =
            g.id === state.roundId ||
            (g.roomId === roomId && (g.status === "WAITING" || g.status === "COUNTDOWN" || g.status === "RUNNING"));

          if (isTarget) {
            matched = true;
            const ticketsCount = state.ticketsCount ?? g.ticketsCount;
            const stake = state.stake ?? g.stakeAmount;
            const totalPot = ticketsCount * stake;
            const houseCutPct = (state.houseCutPercent ?? 20) / 100;
            const houseCutAmount = Math.floor(totalPot * houseCutPct);
            const prizePool = state.derash ?? totalPot - houseCutAmount;

            return {
              ...g,
              id: state.roundId || g.id,
              status: state.status,
              startedAt:
                state.status === "RUNNING"
                  ? state.startedAt || g.startedAt || new Date().toISOString()
                  : state.status === "WAITING" || state.status === "COUNTDOWN"
                  ? null
                  : g.startedAt,
              endedAt:
                state.status === "FINISHED"
                  ? state.endedAt || g.endedAt || new Date().toISOString()
                  : state.status === "WAITING" || state.status === "COUNTDOWN" || state.status === "RUNNING"
                  ? null
                  : g.endedAt,
              ticketsCount,
              playersCount: state.playersCount ?? g.playersCount,
              calledCount: Array.isArray(state.calledNumbers) ? state.calledNumbers.length : g.calledCount,
              totalPot,
              houseCutAmount,
              prizePool,
              countdown: state.countdown,
              currentBall: state.currentBall,
              recentCalls: state.recentCalls,
              pendingSelectionsCount: Array.isArray(state.pendingSelections) ? state.pendingSelections.length : 0,
            };
          }
          return g;
        });

        // Deduplicate games by id
        const deduped = next.filter((item, index, self) =>
          index === self.findIndex((t) => t.id === item.id)
        );

        // If newly created round is not yet in our table and we are on unfiltered page 1, fetch silently
        const f = filterStateRef.current;
        const canInjectLive =
          (f.datePreset === "all" || f.datePreset === "today") && !f.debouncedSearch;
        if (!matched && f.page === 1 && canInjectLive && state.status !== "FINISHED") {
          fetchGames(true);
        }
        return sortGamesList(deduped);
      });

      // Update active inspect modal if open for this room/round
      if (detailRef.current && (detailRef.current.id === state.roundId || (detailRef.current.roomId === roomId && detailRef.current.status !== "FINISHED"))) {
        setDetail((d) => {
          if (!d) return null;
          const ticketsCount = state.ticketsCount ?? d.tickets.length;
          const totalPot = ticketsCount * d.stakeAmount;
          const houseCutAmount = Math.floor(totalPot * (d.houseCutPercent / 100));
          return {
            ...d,
            id: state.roundId || d.id,
            status: state.status,
            calledNumbers: Array.isArray(state.calledNumbers) ? state.calledNumbers : d.calledNumbers,
            currentBall: state.currentBall ?? d.currentBall,
            totalPot,
            houseCutAmount,
            prizePool: state.derash ?? totalPot - houseCutAmount,
          };
        });
      }
    });

    // 2. Granular live game events (countdown ticks, ball calls, ticket purchases, wins)
    s.on("admin_game_event", ({ roomId, event, payload }: { roomId: string; event: string; payload: any }) => {
      if (event === "countdown_tick") {
        setGames((prev) =>
          prev.map((g) =>
            (g.id === payload?.roundId || (g.roomId === roomId && g.status !== "FINISHED" && g.status !== "CANCELLED_REFUNDED"))
              ? { ...g, status: "COUNTDOWN", countdown: payload?.countdown }
              : g
          )
        );
      } else if (event === "ball_called") {
        setGames((prev) =>
          sortGamesList(
            prev.map((g) => {
              if (g.id === payload?.roundId || (g.roomId === roomId && g.status !== "FINISHED" && g.status !== "CANCELLED_REFUNDED")) {
                const newCount = Array.isArray(payload?.calledNumbers)
                  ? payload.calledNumbers.length
                  : g.calledCount + 1;
                return {
                  ...g,
                  status: "RUNNING",
                  startedAt: g.startedAt || new Date().toISOString(),
                  calledCount: newCount,
                  currentBall: payload?.ball || g.currentBall,
                  recentCalls: payload?.recentCalls || g.recentCalls,
                };
              }
              return g;
            })
          )
        );

        if (detailRef.current && (detailRef.current.id === payload?.roundId || (detailRef.current.roomId === roomId && detailRef.current.status !== "FINISHED"))) {
          setDetail((d) => {
            if (!d) return null;
            const updatedCalled = Array.isArray(payload?.calledNumbers)
              ? payload.calledNumbers
              : payload?.ball?.num
              ? [...d.calledNumbers, payload.ball.num]
              : d.calledNumbers;
            return {
              ...d,
              status: "RUNNING",
              currentBall: payload?.ball || d.currentBall,
              calledNumbers: updatedCalled,
            };
          });
        }
      } else if (event === "ticket_purchased") {
        setGames((prev) =>
          prev.map((g) => {
            if (g.id === payload?.roundId || (g.roomId === roomId && g.status !== "FINISHED" && g.status !== "CANCELLED_REFUNDED")) {
              const ticketsCount = payload?.ticketsCount ?? g.ticketsCount;
              const totalPot = ticketsCount * g.stakeAmount;
              const houseCutAmount = Math.floor(totalPot * 0.2);
              return {
                ...g,
                ticketsCount,
                totalPot,
                houseCutAmount,
                prizePool: totalPot - houseCutAmount,
              };
            }
            return g;
          })
        );

        if (detailRef.current && (detailRef.current.id === payload?.roundId || (detailRef.current.roomId === roomId && detailRef.current.status !== "FINISHED"))) {
          setDetail((d) => {
            if (!d) return null;
            return {
              ...d,
              tickets: Array.isArray(payload?.tickets) ? payload.tickets : d.tickets,
            };
          });
        }
      } else if (event === "game_started") {
        const nowIso = new Date().toISOString();
        setGames((prev) =>
          sortGamesList(
            prev.map((g) =>
              (g.id === payload?.roundId || (g.roomId === roomId && g.status !== "FINISHED" && g.status !== "CANCELLED_REFUNDED"))
                ? { ...g, status: "RUNNING", startedAt: payload?.startedAt || g.startedAt || nowIso, countdown: undefined }
                : g
            )
          )
        );
        if (detailRef.current && (detailRef.current.id === payload?.roundId || (detailRef.current.roomId === roomId && detailRef.current.status !== "FINISHED"))) {
          setDetail((d) => (d ? { ...d, status: "RUNNING", startedAt: d.startedAt || nowIso } : null));
        }
      } else if (event === "game_won") {
        const nowIso = new Date().toISOString();
        setGames((prev) =>
          sortGamesList(
            prev.map((g) => {
              if (g.id === payload?.roundId || (g.roomId === roomId && g.status !== "FINISHED" && g.status !== "CANCELLED_REFUNDED")) {
                const freshWinners = Array.isArray(payload?.winners)
                  ? payload.winners.map((w: any) => ({
                      userId: "",
                      userName: w.name,
                      cartelaNumber: w.cardNo,
                      prizeWon: payload.derash || 0,
                    }))
                  : g.winners;
                return {
                  ...g,
                  status: "FINISHED",
                  endedAt: payload?.endedAt || nowIso,
                  winners: freshWinners,
                };
              }
              return g;
            })
          )
        );

        if (detailRef.current && (detailRef.current.id === payload?.roundId || (detailRef.current.roomId === roomId && detailRef.current.status !== "FINISHED"))) {
          setDetail((d) => {
            if (!d) return null;
            const updatedTickets = d.tickets.map((t) =>
              t.cartelaNumber === payload?.winningCartelaNo
                ? { ...t, status: "WINNER", prizeWon: payload?.derash || 0 }
                : t
            );
            return { ...d, status: "FINISHED", endedAt: nowIso, tickets: updatedTickets };
          });
        }
      } else if (event === "game_ended") {
        const nowIso = new Date().toISOString();
        setGames((prev) =>
          sortGamesList(
            prev.map((g) =>
              (g.id === payload?.roundId || (g.roomId === roomId && g.status !== "FINISHED" && g.status !== "CANCELLED_REFUNDED"))
                ? { ...g, status: "FINISHED", endedAt: payload?.endedAt || g.endedAt || nowIso }
                : g
            )
          )
        );
        setTimeout(() => fetchGames(true), 3000);
      }
    });

    // 3. Live user card selection updates
    s.on("admin_room_selections", ({ roomId, pendingSelections }: { roomId: string; pendingSelections: any[] }) => {
      setGames((prev) =>
        prev.map((g) =>
          g.roomId === roomId
            ? { ...g, pendingSelectionsCount: Array.isArray(pendingSelections) ? pendingSelections.length : 0 }
            : g
        )
      );
    });

    // 4. Background silent sync poll every 3.5 seconds
    const pollTimer = setInterval(() => {
      fetchGames(true);
    }, 3500);

    return () => {
      clearInterval(pollTimer);
      s.disconnect();
    };
  }, [page, statusFilter]);

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
      {/* Top Header with Filters and Live Real-time Status Badge */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#0f1422] p-1 rounded-xl border border-slate-200 dark:border-[#1a233b] w-fit shadow-sm">
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
                statusFilter === val ? "bg-blue-600 text-white shadow" : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Rows selector + Live Realtime Connection Indicator */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-gray-400">Rows:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] focus:border-blue-500 focus:outline-none rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white cursor-pointer shadow-sm"
            >
              {ROW_LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] shadow-sm">
            <span className="relative flex h-2.5 w-2.5">
              {isSocketConnected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isSocketConnected ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
            </span>
            <span className="text-xs font-extrabold text-slate-700 dark:text-gray-300 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              <span>{isSocketConnected ? "Live Realtime Monitor" : "Reconnecting..."}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Date/Time & Winner Search Filters Bar */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-3.5 sm:p-4 flex flex-col gap-3 shadow-sm">
        {/* Row A: Quick Date Presets + Search Scope + Search Input */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-gray-400 flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5" />
              Date:
            </span>
            {(
              [
                ["all", "All Time"],
                ["today", "Today"],
                ["yesterday", "Yesterday"],
                ["7d", "Last 7 Days"],
                ["custom", "Custom Day/Time"],
              ] as const
            ).map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  if (preset === "custom" && !selectedDate) {
                    const today = formatLocalYmd(new Date());
                    setSelectedDate(today);
                    setToDate(today);
                  }
                  setDatePreset(preset);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  datePreset === preset
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-[#131b2e] text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-[#1a2540]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Search Scope Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#131b2e] p-1 rounded-xl shrink-0">
              {(
                [
                  ["all", "All Matches"],
                  ["winner", "Winners Only"],
                ] as const
              ).map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => {
                    setSearchScope(scope);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                    searchScope === scope
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={
                  searchScope === "winner"
                    ? "Winner name, phone, @user, #card..."
                    : "Winner, player, phone, #card, room, ID..."
                }
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl pl-8 pr-8 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setDebouncedSearch("");
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {(datePreset !== "all" || fromTime || toTime || search || statusFilter !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ALL");
                  setDatePreset("all");
                  setFromTime("");
                  setToTime("");
                  setSearch("");
                  setDebouncedSearch("");
                  setSearchScope("all");
                  setPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#131b2e] hover:bg-slate-200 dark:hover:bg-[#1a2540] border border-slate-200 dark:border-[#1e2945] text-xs font-bold text-slate-700 dark:text-gray-200 flex items-center justify-center gap-1.5 transition shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Row B: Exact Day & Hour:Minute:Second Controls */}
        {datePreset !== "all" && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-[#1a233b] flex flex-wrap items-center gap-3 text-xs">
            {datePreset === "custom" && (
              <>
                <label className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-gray-400">From Day:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedDate(val);
                      if (!toDate || toDate < val) setToDate(val);
                      setPage(1);
                    }}
                    className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-gray-400">To Day:</span>
                  <input
                    type="date"
                    value={toDate}
                    min={selectedDate}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setPage(1);
                    }}
                    className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </label>
              </>
            )}

            <label className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-gray-400">
                From Time (HH:MM:SS):
              </span>
              <input
                type="time"
                step={1}
                value={fromTime}
                onChange={(e) => {
                  setFromTime(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-white"
              />
            </label>

            <label className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-gray-400">
                To Time (HH:MM:SS):
              </span>
              <input
                type="time"
                step={1}
                value={toTime}
                onChange={(e) => {
                  setToTime(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-white"
              />
            </label>

            {(fromTime || toTime) && (
              <button
                type="button"
                onClick={() => {
                  setFromTime("");
                  setToTime("");
                  setPage(1);
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition"
              >
                Clear Time
              </button>
            )}
          </div>
        )}
      </div>

      {/* Rounds Table */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl shadow-sm dark:shadow-xl overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1a233b] text-[11px] uppercase tracking-wider text-slate-500 dark:text-gray-400 bg-slate-50 dark:bg-[#0b101d]">
                <th className="py-3.5 px-4 font-bold">Room &amp; Time</th>
                <th className="py-3.5 px-4 font-bold">Status (Live)</th>
                <th className="py-3.5 px-4 font-bold">Players / Cartelas</th>
                <th className="py-3.5 px-4 font-bold">Pot / House Cut</th>
                <th className="py-3.5 px-4 font-bold">Winners</th>
                <th className="py-3.5 px-4 font-bold text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#161e34] text-xs">
              {isLoading && games.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 dark:text-gray-500">
                    Loading game rounds...
                  </td>
                </tr>
              ) : games.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 dark:text-gray-500">
                    No game rounds found.
                  </td>
                </tr>
              ) : (
                games.map((g) => {
                  const isLiveRunning = g.status === "RUNNING";
                  const isCountdown = g.status === "COUNTDOWN";
                  const isWaiting = g.status === "WAITING";

                  return (
                    <tr
                      key={g.id}
                      className={`transition ${
                        isLiveRunning
                          ? "bg-cyan-500/10 dark:bg-cyan-950/20 hover:bg-cyan-500/15 dark:hover:bg-cyan-900/30"
                          : isCountdown
                          ? "bg-amber-500/10 dark:bg-amber-950/20 hover:bg-amber-500/15 dark:hover:bg-amber-900/30"
                          : "hover:bg-slate-50 dark:hover:bg-[#131b2e]/60"
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{g.roomNameAm}</span>
                          <span className="text-slate-500 dark:text-gray-400 text-[11px]">({g.stakeAmount} ETB)</span>
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-gray-500 flex items-center gap-1 mt-0.5">
                          <span className="font-mono text-slate-500 dark:text-gray-400 font-semibold">ID: TB{g.id.slice(-6).toUpperCase()}</span>
                          {!isWaiting && !isCountdown && (
                            <>
                              <span>•</span>
                              <span>{formatDateTime(g.endedAt || g.startedAt || g.createdAt)}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Live Status Badge */}
                      <td className="py-3.5 px-4">
                        {isCountdown ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40 animate-pulse shadow-sm shadow-amber-500/20">
                            <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 animate-ping" />
                            <Clock className="w-3 h-3" />
                            <span>COUNTDOWN {g.countdown !== undefined ? `(${g.countdown}s)` : ""}</span>
                          </span>
                        ) : isLiveRunning ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20">
                            <span className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse" />
                            <Sparkles className="w-3 h-3 text-cyan-600 dark:text-cyan-300" />
                            <span>
                              LIVE {g.currentBall ? `• ${g.currentBall.letter}-${g.currentBall.num}` : ""}
                            </span>
                          </span>
                        ) : isWaiting ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                            <span>⏳ WAITING ({g.ticketsCount} cards)</span>
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                              g.status === "FINISHED"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                : g.status === "CANCELLED_REFUNDED"
                                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                : "bg-slate-100 dark:bg-gray-500/15 text-slate-600 dark:text-gray-400 border-slate-300 dark:border-transparent"
                            }`}
                          >
                            {g.status}
                          </span>
                        )}
                      </td>

                      {/* Players & Balls Count */}
                      <td className="py-3.5 px-4">
                        <div className="text-slate-900 dark:text-white font-semibold flex items-center gap-1.5">
                          <span>{g.playersCount} players</span>
                          <span className="text-slate-400 dark:text-gray-500">•</span>
                          <span className="text-blue-600 dark:text-cyan-300 font-bold">{g.ticketsCount} cartelas</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                          <span className={isLiveRunning ? "text-amber-600 dark:text-amber-400 font-bold" : ""}>
                            {g.calledCount} / 75 balls drawn
                          </span>
                          {g.pendingSelectionsCount && g.pendingSelectionsCount > 0 ? (
                            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/20 px-1.5 rounded">
                              +{g.pendingSelectionsCount} selecting
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Pot & Commission */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900 dark:text-white text-xs">
                          Pot: <span className="text-emerald-600 dark:text-emerald-400">{formatMoney(g.totalPot)} ETB</span>
                        </div>
                        <div className="text-[11px] text-purple-600 dark:text-purple-400 font-bold mt-0.5">
                          House: +{formatMoney(g.houseCutAmount)} ETB
                        </div>
                      </td>

                      {/* Winners */}
                      <td className="py-3.5 px-4">
                        {g.winners.length === 0 ? (
                          <span className="text-slate-400 dark:text-gray-500">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {g.winners.map((w, i) => (
                              <span key={i} className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                                <Trophy className="w-3 h-3 shrink-0" />
                                <span>{w.userName} (#{w.cartelaNumber})</span>
                                <span className="text-emerald-700 dark:text-emerald-300 font-black">+{formatMoney(w.prizeWon)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Inspect Button */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => inspectRound(g.id)}
                          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#162038] dark:hover:bg-blue-600 border border-slate-200 dark:border-transparent text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition shadow-sm"
                          title="Inspect Round Live"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-[#1a233b] bg-slate-50 dark:bg-[#0b101d] flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
          <span>
            Showing <b className="text-slate-900 dark:text-white">{games.length}</b> of{" "}
            <b className="text-slate-900 dark:text-white">{total}</b> rounds (Page {page} of {totalPages})
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg bg-white dark:bg-[#162038] border border-slate-200 dark:border-transparent text-slate-600 dark:text-white disabled:opacity-30 transition shadow-sm"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg bg-white dark:bg-[#162038] border border-slate-200 dark:border-transparent text-slate-600 dark:text-white disabled:opacity-30 transition shadow-sm"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Round Detail / Live Monitor Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-3xl max-h-[90vh] bg-[#0f1422] border border-[#1e2742] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1a233b] flex items-center justify-between bg-[#0b101d]">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-black text-white">
                    {detail.roomNameAm} — Round Monitor
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                      detail.status === "RUNNING"
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse"
                        : detail.status === "COUNTDOWN"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                        : detail.status === "FINISHED"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-purple-500/20 text-purple-300"
                    }`}
                  >
                    {detail.status}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                  Round ID: {detail.id}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Live Synced</span>
                </span>
                <button
                  onClick={() => setDetail(null)}
                  className="p-2 rounded-xl bg-[#162038] text-gray-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex flex-col gap-5">
              {/* Metrics Row */}
              <div className="grid grid-cols-3 gap-3 bg-[#0a0e18] border border-[#1a233b] rounded-xl p-4 text-xs">
                <div>
                  <span className="text-gray-400 block mb-0.5">Total Pot</span>
                  <b className="text-base text-white">{formatMoney(detail.totalPot)} ETB</b>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">House Cut ({detail.houseCutPercent}%)</span>
                  <b className="text-base text-purple-400">{formatMoney(detail.houseCutAmount)} ETB</b>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Prize Pool (Derash)</span>
                  <b className="text-base text-emerald-400">{formatMoney(detail.prizePool)} ETB</b>
                </div>
              </div>

              {/* Real-time Called Balls */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-extrabold text-gray-300 uppercase flex items-center gap-2">
                    <span>Called Balls</span>
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-black">
                      {detail.calledNumbers.length} / 75
                    </span>
                  </h4>
                  {detail.status === "RUNNING" && detail.calledNumbers.length > 0 && (
                    <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      <span>Last Ball: {ballLabel(detail.calledNumbers[detail.calledNumbers.length - 1])}</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 bg-[#0a0e18] border border-[#1a233b] rounded-xl p-3 max-h-40 overflow-y-auto">
                  {detail.calledNumbers.length === 0 ? (
                    <span className="text-xs text-gray-500 py-3 w-full text-center">
                      No balls called yet. Balls appear live here when the round starts.
                    </span>
                  ) : (
                    detail.calledNumbers.map((num, idx) => {
                      const isLatest = idx === detail.calledNumbers.length - 1;
                      return (
                        <span
                          key={idx}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all ${
                            isLatest
                              ? "bg-amber-500 text-black border-2 border-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.8)] scale-105"
                              : "bg-[#162038] border border-[#243356] text-cyan-300"
                          }`}
                        >
                          {ballLabel(num)}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Real-time Purchased Cartelas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-extrabold text-gray-300 uppercase flex items-center gap-2">
                    <span>Purchased Cartelas</span>
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-black">
                      {detail.tickets.length} tickets
                    </span>
                  </h4>
                </div>

                <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                  {detail.tickets.length === 0 ? (
                    <div className="bg-[#0a0e18] border border-[#1a233b] rounded-xl p-6 text-center text-xs text-gray-500">
                      No tickets purchased yet.
                    </div>
                  ) : (
                    detail.tickets.map((t) => (
                      <div
                        key={t.id}
                        className={`border rounded-xl px-4 py-2.5 flex items-center justify-between text-xs transition ${
                          t.status === "WINNER"
                            ? "bg-emerald-950/40 border-emerald-500/60 shadow-lg"
                            : "bg-[#0a0e18] border-[#1a233b]"
                        }`}
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
                                ? "bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.8)]"
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
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
