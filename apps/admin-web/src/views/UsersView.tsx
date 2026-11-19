import React, { useEffect, useState } from "react";
import {
  Search,
  PlusCircle,
  MinusCircle,
  Ban,
  CheckCircle,
  Eye,
  Send,
  Shield,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { adminFetch, formatDateTime, formatMoney } from "../api";
import type { AdminProfile, AdminUserRow } from "../types";

interface UsersViewProps {
  admin: AdminProfile;
  refreshSignal: number;
}

interface UserDetailData {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  phoneNumber: string | null;
  role: "PLAYER" | "CASHIER" | "SUPER_ADMIN";
  isBanned: boolean;
  referralCode: string;
  balance: number;
  lockedBalance: number;
  createdAt: string;
  referredBy: { id: string; firstName: string; username: string | null; phoneNumber: string | null } | null;
  referrals: Array<{ id: string; firstName: string; phoneNumber: string | null; createdAt: string }>;
  stats: {
    totalDeposited: number;
    totalWithdrawn: number;
    totalBet: number;
    totalWon: number;
  };
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    note: string | null;
    createdAt: string;
  }>;
  tickets: Array<{
    id: string;
    roomName: string;
    cartelaNumber: number;
    status: string;
    pricePaid: number;
    prizeWon: number;
    purchasedAt: string;
  }>;
}

export const UsersView: React.FC<UsersViewProps> = ({ admin, refreshSignal }) => {
  const isSuperAdmin = admin.role === "SUPER_ADMIN";
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "verified" | "rich" | "banned" | "staff">("all");
  const [isLoading, setIsLoading] = useState(false);

  // Modals
  const [detailUser, setDetailUser] = useState<UserDetailData | null>(null);
  const [detailTab, setDetailTab] = useState<"tx" | "tickets" | "referrals">("tx");
  const [detailLoading, setDetailLoading] = useState(false);

  const [adjustTarget, setAdjustTarget] = useState<AdminUserRow | null>(null);
  const [adjustType, setAdjustType] = useState<"add" | "deduct">("add");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [notifyPlayer, setNotifyPlayer] = useState(true);

  const [msgTarget, setMsgTarget] = useState<AdminUserRow | null>(null);
  const [msgText, setMsgText] = useState("");

  const [roleTarget, setRoleTarget] = useState<AdminUserRow | null>(null);
  const [roleValue, setRoleValue] = useState<"PLAYER" | "CASHIER" | "SUPER_ADMIN">("PLAYER");
  const [roleUsername, setRoleUsername] = useState("");
  const [rolePassword, setRolePassword] = useState("");

  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: "25",
        filter,
      });
      if (search.trim()) qs.set("search", search.trim());
      const res = await adminFetch(`/api/admin/users?${qs.toString()}`);
      if (res.ok) {
        setUsers(res.users || []);
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
    fetchUsers();
  }, [page, filter, search, refreshSignal]);

  const openUserDetail = async (userId: string) => {
    setDetailLoading(true);
    setDetailTab("tx");
    try {
      const res = await adminFetch(`/api/admin/users/${userId}`);
      if (res.ok && res.user) {
        setDetailUser(res.user);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load user details", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    const val = Number(adjustAmount);
    if (!Number.isFinite(val) || val <= 0) {
      showToast("Enter a valid positive amount", "error");
      return;
    }
    setActionLoading(true);
    try {
      const finalAmount = adjustType === "add" ? val : -val;
      const res = await adminFetch(`/api/admin/users/${adjustTarget.id}/adjust-balance`, {
        method: "POST",
        body: JSON.stringify({
          amount: finalAmount,
          note: adjustNote.trim() || `Admin manual ${adjustType}`,
          notifyUser: notifyPlayer,
        }),
      });
      if (res.ok) {
        showToast(`Balance updated! New balance: ${formatMoney(res.newBalance)} ETB`);
        setAdjustTarget(null);
        setAdjustAmount("");
        setAdjustNote("");
        fetchUsers();
        if (detailUser?.id === adjustTarget.id) openUserDetail(adjustTarget.id);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Adjustment failed", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBan = async (u: AdminUserRow) => {
    const nextBanned = !u.isBanned;
    const reason = nextBanned
      ? prompt(`Enter ban reason for ${u.firstName} (optional):`) ?? ""
      : "";
    if (nextBanned && reason === null) return;
    setActionLoading(true);
    try {
      const res = await adminFetch(`/api/admin/users/${u.id}/ban`, {
        method: "POST",
        body: JSON.stringify({ isBanned: nextBanned, reason }),
      });
      if (res.ok) {
        showToast(nextBanned ? `${u.firstName} has been banned.` : `${u.firstName} has been unbanned.`);
        fetchUsers();
        if (detailUser?.id === u.id) openUserDetail(u.id);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Ban toggle failed", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgTarget || !msgText.trim()) return;
    setActionLoading(true);
    try {
      const res = await adminFetch(`/api/admin/users/${msgTarget.id}/message`, {
        method: "POST",
        body: JSON.stringify({ message: msgText.trim() }),
      });
      if (res.ok) {
        showToast(`Telegram message sent to ${msgTarget.firstName}!`);
        setMsgTarget(null);
        setMsgText("");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to send Telegram message", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleTarget) return;
    setActionLoading(true);
    try {
      const body: Record<string, string> = { role: roleValue };
      if (roleUsername.trim()) body.username = roleUsername.trim();
      if (rolePassword.trim()) body.password = rolePassword.trim();
      const res = await adminFetch(`/api/admin/users/${roleTarget.id}/role`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showToast(`Updated ${roleTarget.firstName} to ${roleValue}!`);
        setRoleTarget(null);
        setRolePassword("");
        fetchUsers();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Role update failed", "error");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 flex flex-col gap-5 animate-fadeIn">
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

      {/* Search & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-[#0f1422] p-1 rounded-xl border border-[#1a233b] w-fit">
          {(
            [
              ["all", "All Players"],
              ["verified", "Verified Phone"],
              ["rich", "Top Balance"],
              ["banned", "Banned"],
              ["staff", "Admins & Cashiers"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setFilter(id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filter === id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search name, phone, @username, TG ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-[#0f1422] border border-[#1a233b] focus:border-blue-500 focus:outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0f1422] border border-[#1a233b] rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1a233b] text-[11px] uppercase tracking-wider text-gray-400 bg-[#0b101d]">
                <th className="py-3.5 px-4 font-bold">Player</th>
                <th className="py-3.5 px-4 font-bold">Phone / TG ID</th>
                <th className="py-3.5 px-4 font-bold">Wallet</th>
                <th className="py-3.5 px-4 font-bold">Activity</th>
                <th className="py-3.5 px-4 font-bold">Status</th>
                <th className="py-3.5 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#161e34] text-xs">
              {isLoading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-500">
                    Loading players...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-500">
                    No players matched your filter.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#131b2e]/60 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>
                          {u.firstName} {u.lastName || ""}
                        </span>
                        {u.role !== "PLAYER" && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                              u.role === "SUPER_ADMIN"
                                ? "bg-amber-500/20 text-amber-400"
                                : "bg-cyan-500/20 text-cyan-400"
                            }`}
                          >
                            {u.role}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {u.username ? `@${u.username}` : "No username"} • Ref:{" "}
                        <code className="text-gray-300">{u.referralCode}</code>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-mono text-white">{u.phoneNumber || "Unverified"}</div>
                      <div className="text-[11px] text-gray-500 font-mono">ID: {u.telegramId}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-black text-emerald-400">
                        {formatMoney(u.balance)} ETB
                      </div>
                      {u.lockedBalance > 0 && (
                        <div className="text-[10px] text-amber-400">
                          Locked: {formatMoney(u.lockedBalance)} ETB
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-[11px] text-gray-300">
                      <div>Tickets: <b>{u.ticketsCount}</b> • Invites: <b>{u.referralsCount}</b></div>
                      <div className="text-gray-500">Joined {new Date(u.createdAt).toLocaleDateString()}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      {u.isBanned ? (
                        <span className="px-2 py-1 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-400">
                          BANNED
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-400">
                          ACTIVE
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          title="Inspect Full Profile & History"
                          onClick={() => openUserDetail(u.id)}
                          className="p-2 rounded-lg bg-[#162038] hover:bg-blue-600 text-gray-300 hover:text-white transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="Send Direct Telegram Message"
                          onClick={() => {
                            setMsgTarget(u);
                            setMsgText("");
                          }}
                          className="p-2 rounded-lg bg-[#162038] hover:bg-cyan-600 text-gray-300 hover:text-white transition"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                        {isSuperAdmin && (
                          <>
                            <button
                              title="Credit / Debit Balance"
                              onClick={() => {
                                setAdjustTarget(u);
                                setAdjustType("add");
                                setAdjustAmount("");
                                setAdjustNote("");
                              }}
                              className="p-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-600 text-emerald-400 hover:text-white transition"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Manage Staff Role & Web Login"
                              onClick={() => {
                                setRoleTarget(u);
                                setRoleValue(u.role);
                                setRoleUsername(u.username || "");
                                setRolePassword("");
                              }}
                              className="p-2 rounded-lg bg-purple-500/15 hover:bg-purple-600 text-purple-400 hover:text-white transition"
                            >
                              <Shield className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title={u.isBanned ? "Unban Player" : "Ban Player"}
                              disabled={actionLoading || u.id === admin.id}
                              onClick={() => handleToggleBan(u)}
                              className={`p-2 rounded-lg transition disabled:opacity-30 ${
                                u.isBanned
                                  ? "bg-emerald-500/15 hover:bg-emerald-600 text-emerald-400 hover:text-white"
                                  : "bg-rose-500/15 hover:bg-rose-600 text-rose-400 hover:text-white"
                              }`}
                            >
                              {u.isBanned ? (
                                <CheckCircle className="w-3.5 h-3.5" />
                              ) : (
                                <Ban className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-[#1a233b] bg-[#0b101d] flex items-center justify-between text-xs text-gray-400">
          <span>
            Showing <b>{users.length}</b> of <b>{total}</b> players (Page {page} of {totalPages})
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg bg-[#162038] hover:bg-blue-600 text-white disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg bg-[#162038] hover:bg-blue-600 text-white disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Full User Inspector */}
      {(detailUser || detailLoading) && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[90vh] bg-[#0f1422] border border-[#1e2742] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            {detailLoading && !detailUser ? (
              <div className="p-10 text-center text-xs text-gray-400">Loading player dossier...</div>
            ) : (
              detailUser && (
                <>
                  <div className="px-6 py-5 border-b border-[#1a233b] flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black text-white flex items-center gap-2">
                        <span>
                          {detailUser.firstName} {detailUser.lastName || ""}
                        </span>
                        <span className="text-xs font-mono text-cyan-400">
                          #{detailUser.telegramId}
                        </span>
                      </h3>
                      <p className="text-xs text-gray-400">
                        Phone: <b>{detailUser.phoneNumber || "Unverified"}</b> • Username:{" "}
                        <b>{detailUser.username ? `@${detailUser.username}` : "—"}</b> • Ref Code:{" "}
                        <code>{detailUser.referralCode}</code>
                        {detailUser.referredBy && (
                          <>
                            {" "}
                            • Invited by: <b className="text-cyan-300">{detailUser.referredBy.firstName}</b>
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => setDetailUser(null)}
                      className="p-2 rounded-xl bg-[#162038] text-gray-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Stats Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-5 border-b border-[#1a233b] bg-[#0a0e18]">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase font-bold">Wallet</div>
                      <div className="text-base font-black text-emerald-400">
                        {formatMoney(detailUser.balance)} ETB
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase font-bold">Deposited</div>
                      <div className="text-base font-black text-white">
                        {formatMoney(detailUser.stats.totalDeposited)} ETB
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase font-bold">Withdrawn</div>
                      <div className="text-base font-black text-amber-400">
                        {formatMoney(detailUser.stats.totalWithdrawn)} ETB
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase font-bold">Total Bet</div>
                      <div className="text-base font-black text-gray-200">
                        {formatMoney(detailUser.stats.totalBet)} ETB
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase font-bold">Total Won</div>
                      <div className="text-base font-black text-cyan-400">
                        {formatMoney(detailUser.stats.totalWon)} ETB
                      </div>
                    </div>
                  </div>

                  {/* Sub-tabs */}
                  <div className="px-6 pt-4 flex items-center gap-2 border-b border-[#1a233b]">
                    {(
                      [
                        ["tx", `Wallet Ledger (${detailUser.transactions.length})`],
                        ["tickets", `Bingo Tickets (${detailUser.tickets.length})`],
                        ["referrals", `Invited Friends (${detailUser.referrals.length})`],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        onClick={() => setDetailTab(id)}
                        className={`px-4 py-2.5 text-xs font-bold border-b-2 transition ${
                          detailTab === id
                            ? "border-blue-500 text-white"
                            : "border-transparent text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 overflow-y-auto p-6">
                    {detailTab === "tx" && (
                      <div className="flex flex-col gap-2">
                        {detailUser.transactions.length === 0 ? (
                          <div className="text-xs text-gray-500 text-center py-8">No transactions yet.</div>
                        ) : (
                          detailUser.transactions.map((t) => (
                            <div
                              key={t.id}
                              className="bg-[#0a0e18] border border-[#1a233b] rounded-xl px-4 py-3 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-black text-cyan-300 mr-2">{t.type}</span>
                                <span className="text-gray-400">{t.note || "—"}</span>
                                <div className="text-[10px] text-gray-500 mt-0.5">
                                  {formatDateTime(t.createdAt)}
                                </div>
                              </div>
                              <div className="text-right">
                                <div
                                  className={`font-black ${
                                    t.amount >= 0 ? "text-emerald-400" : "text-rose-400"
                                  }`}
                                >
                                  {t.amount >= 0 ? "+" : ""}
                                  {formatMoney(t.amount)} ETB
                                </div>
                                <div className="text-[10px] text-gray-500">
                                  Bal: {formatMoney(t.balanceAfter)} ETB
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {detailTab === "tickets" && (
                      <div className="flex flex-col gap-2">
                        {detailUser.tickets.length === 0 ? (
                          <div className="text-xs text-gray-500 text-center py-8">No game tickets yet.</div>
                        ) : (
                          detailUser.tickets.map((t) => (
                            <div
                              key={t.id}
                              className="bg-[#0a0e18] border border-[#1a233b] rounded-xl px-4 py-3 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-bold text-white">{t.roomName}</span> • Cartela{" "}
                                <b className="text-cyan-400">#{t.cartelaNumber}</b>
                                <div className="text-[10px] text-gray-500 mt-0.5">
                                  {formatDateTime(t.purchasedAt)}
                                </div>
                              </div>
                              <div className="text-right">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    t.status === "WINNER"
                                      ? "bg-emerald-500/20 text-emerald-400"
                                      : t.status === "BURNED_FALSE_CLAIM"
                                        ? "bg-rose-500/20 text-rose-400"
                                        : "bg-slate-700/60 text-gray-300"
                                  }`}
                                >
                                  {t.status}
                                </span>
                                <div className="text-[11px] text-gray-400 mt-1">
                                  Bet: {t.pricePaid} • Won:{" "}
                                  <b className="text-emerald-400">{formatMoney(t.prizeWon)} ETB</b>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {detailTab === "referrals" && (
                      <div className="flex flex-col gap-2">
                        {detailUser.referrals.length === 0 ? (
                          <div className="text-xs text-gray-500 text-center py-8">No referrals yet.</div>
                        ) : (
                          detailUser.referrals.map((r) => (
                            <div
                              key={r.id}
                              className="bg-[#0a0e18] border border-[#1a233b] rounded-xl px-4 py-3 flex items-center justify-between text-xs"
                            >
                              <span className="font-bold text-white">{r.firstName}</span>
                              <span className="text-gray-400">{r.phoneNumber || "Unverified"}</span>
                              <span className="text-gray-500">{formatDateTime(r.createdAt)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}

      {/* Modal: Adjust Wallet Balance */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAdjustSubmit}
            className="w-full max-w-md bg-[#0f1422] border border-[#1e2742] rounded-2xl p-6 shadow-2xl flex flex-col gap-4"
          >
            <div>
              <h3 className="text-base font-black text-white">Adjust Player Wallet</h3>
              <p className="text-xs text-gray-400">
                Player: <b>{adjustTarget.firstName}</b> • Current:{" "}
                <b className="text-emerald-400">{formatMoney(adjustTarget.balance)} ETB</b>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdjustType("add")}
                className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border ${
                  adjustType === "add"
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "bg-[#0a0e18] border-[#1e2742] text-gray-400"
                }`}
              >
                <PlusCircle className="w-4 h-4" /> Credit (+)
              </button>
              <button
                type="button"
                onClick={() => setAdjustType("deduct")}
                className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border ${
                  adjustType === "deduct"
                    ? "bg-rose-600 border-rose-500 text-white"
                    : "bg-[#0a0e18] border-[#1e2742] text-gray-400"
                }`}
              >
                <MinusCircle className="w-4 h-4" /> Debit (−)
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">Amount (ETB)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="e.g. 100"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-4 py-2.5 text-sm text-white font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">Reason / Audit Note</label>
              <input
                type="text"
                required
                placeholder="e.g. Manual cash deposit / Bonus / Correction"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-4 py-2.5 text-xs text-white"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyPlayer}
                onChange={(e) => setNotifyPlayer(e.target.checked)}
                className="rounded"
              />
              <span>Notify player on Telegram immediately</span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1a233b] dark:hover:bg-[#243356] border border-slate-300 dark:border-transparent text-xs font-bold text-slate-700 dark:text-gray-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white disabled:opacity-50"
              >
                Apply Adjustment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Send Direct Message */}
      {msgTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSendMessage}
            className="w-full max-w-md bg-[#0f1422] border border-[#1e2742] rounded-2xl p-6 shadow-2xl flex flex-col gap-4"
          >
            <div>
              <h3 className="text-base font-black text-white">Direct Telegram Message</h3>
              <p className="text-xs text-gray-400">
                To: <b>{msgTarget.firstName}</b> ({msgTarget.phoneNumber || msgTarget.telegramId})
              </p>
            </div>
            <textarea
              rows={4}
              required
              placeholder="Write your message in Amharic or English..."
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl p-3 text-xs text-white"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMsgTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1a233b] dark:hover:bg-[#243356] border border-slate-300 dark:border-transparent text-xs font-bold text-slate-700 dark:text-gray-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white disabled:opacity-50"
              >
                Send via Bot
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Role & Staff Credentials */}
      {roleTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleRoleSubmit}
            className="w-full max-w-md bg-[#0f1422] border border-[#1e2742] rounded-2xl p-6 shadow-2xl flex flex-col gap-4"
          >
            <div>
              <h3 className="text-base font-black text-white">Staff Role &amp; Portal Login</h3>
              <p className="text-xs text-gray-400">
                Manage permissions for <b>{roleTarget.firstName}</b>
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">Role</label>
              <select
                value={roleValue}
                onChange={(e) => setRoleValue(e.target.value as "PLAYER" | "CASHIER" | "SUPER_ADMIN")}
                className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-4 py-2.5 text-xs text-white"
              >
                <option value="PLAYER">PLAYER (Regular User)</option>
                <option value="CASHIER">CASHIER (Deposits &amp; Withdrawals)</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN (Full Access)</option>
              </select>
            </div>

            {roleValue !== "PLAYER" && (
              <>
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">
                    Portal Username
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. cashier1"
                    value={roleUsername}
                    onChange={(e) => setRoleUsername(e.target.value)}
                    className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-4 py-2.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">
                    Set / Reset Web Password (Optional, 6+ chars)
                  </label>
                  <input
                    type="password"
                    placeholder="Leave blank to keep existing password"
                    value={rolePassword}
                    onChange={(e) => setRolePassword(e.target.value)}
                    className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-4 py-2.5 text-xs text-white"
                  />
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRoleTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1a233b] dark:hover:bg-[#243356] border border-slate-300 dark:border-transparent text-xs font-bold text-slate-700 dark:text-gray-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white disabled:opacity-50"
              >
                Save Role
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
