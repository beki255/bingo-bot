import React, { useEffect, useState } from "react";
import { Gamepad2, Plus, Settings2, Trash2, CheckCircle, XCircle } from "lucide-react";
import { adminFetch, formatMoney } from "../api";
import type { AdminProfile, AdminRoomRow } from "../types";

interface RoomsViewProps {
  admin: AdminProfile;
  refreshSignal: number;
}

export const RoomsView: React.FC<RoomsViewProps> = ({ admin, refreshSignal }) => {
  const isSuperAdmin = admin.role === "SUPER_ADMIN";
  const [rooms, setRooms] = useState<AdminRoomRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [nameAm, setNameAm] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [stakeAmount, setStakeAmount] = useState(10);
  const [houseCutPercent, setHouseCutPercent] = useState(20);
  const [minPlayers, setMinPlayers] = useState(2);
  const [maxCartelasPerUser, setMaxCartelasPerUser] = useState(2);
  const [cartelaPoolSize, setCartelaPoolSize] = useState(600);
  const [countdownSeconds, setCountdownSeconds] = useState(30);
  const [callIntervalMs, setCallIntervalMs] = useState(3500);
  const [winningPattern, setWinningPattern] = useState<AdminRoomRow["winningPattern"]>("ONE_LINE");
  const [freeCenter, setFreeCenter] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchRooms = async () => {
    setIsLoading(true);
    try {
      const res = await adminFetch("/api/admin/rooms");
      if (res.ok) setRooms(res.rooms || []);
    } catch {
      // handled
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [refreshSignal]);

  const openCreate = () => {
    setEditingId(null);
    setNameAm("መደብ 50");
    setNameEn("Play 50");
    setStakeAmount(50);
    setHouseCutPercent(20);
    setMinPlayers(2);
    setMaxCartelasPerUser(2);
    setCartelaPoolSize(600);
    setCountdownSeconds(30);
    setCallIntervalMs(3500);
    setWinningPattern("ONE_LINE");
    setFreeCenter(true);
    setIsActive(true);
    setSortOrder(rooms.length);
    setModalOpen(true);
  };

  const openEdit = (r: AdminRoomRow) => {
    setEditingId(r.id);
    setNameAm(r.nameAm);
    setNameEn(r.nameEn);
    setStakeAmount(r.stakeAmount);
    setHouseCutPercent(r.houseCutPercent);
    setMinPlayers(r.minPlayers);
    setMaxCartelasPerUser(r.maxCartelasPerUser ?? 2);
    setCartelaPoolSize(r.cartelaPoolSize);
    setCountdownSeconds(r.countdownSeconds);
    setCallIntervalMs(r.callIntervalMs);
    setWinningPattern(r.winningPattern);
    setFreeCenter(r.freeCenter);
    setIsActive(r.isActive);
    setSortOrder(r.sortOrder);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const payload = {
        nameAm,
        nameEn,
        stakeAmount: Number(stakeAmount),
        houseCutPercent: Number(houseCutPercent),
        minPlayers: Number(minPlayers),
        maxCartelasPerUser: Number(maxCartelasPerUser),
        cartelaPoolSize: Number(cartelaPoolSize),
        countdownSeconds: Number(countdownSeconds),
        callIntervalMs: Number(callIntervalMs),
        winningPattern,
        freeCenter,
        isActive,
        sortOrder: Number(sortOrder),
      };
      if (editingId) {
        await adminFetch(`/api/admin/rooms/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        showToast("Room updated successfully!");
      } else {
        await adminFetch("/api/admin/rooms", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("New Bingo room created!");
      }
      setModalOpen(false);
      fetchRooms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (r: AdminRoomRow) => {
    if (!confirm(`Delete room "${r.nameAm}"?`)) return;
    setActionLoading(true);
    try {
      await adminFetch(`/api/admin/rooms/${r.id}`, { method: "DELETE" });
      showToast("Room deleted.");
      fetchRooms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Cannot delete room", "error");
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
          <h3 className="text-sm font-extrabold text-white">Configured Bingo Rooms</h3>
          <p className="text-xs text-gray-400">
            Configure stakes, commission percentages, countdowns, and winning patterns.
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={openCreate}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-2 shadow-lg shadow-blue-600/30"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Room</span>
          </button>
        )}
      </div>

      {isLoading && rooms.length === 0 ? (
        <div className="py-12 text-center text-xs text-gray-500">Loading rooms...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rooms.map((r) => (
            <div
              key={r.id}
              className="bg-[#0f1422] border border-[#1a233b] rounded-2xl p-5 shadow-xl flex flex-col gap-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
                    <Gamepad2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-white">{r.nameAm}</div>
                    <div className="text-[11px] text-gray-400">{r.nameEn}</div>
                  </div>
                </div>
                {r.isActive ? (
                  <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full">
                    <CheckCircle className="w-3 h-3" /> ACTIVE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-black text-gray-400 bg-slate-700/50 px-2.5 py-1 rounded-full">
                    <XCircle className="w-3 h-3" /> HIDDEN
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-[#0a0e18] border border-[#1a233b] rounded-xl p-3.5">
                <div>
                  <span className="text-[10px] text-gray-500 block">Stake</span>
                  <b className="text-emerald-400">{formatMoney(r.stakeAmount)} ETB</b>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">House Cut</span>
                  <b className="text-purple-400">{r.houseCutPercent}%</b>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">Countdown</span>
                  <b className="text-white">{r.countdownSeconds}s</b>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">Ball Speed</span>
                  <b className="text-white">{(r.callIntervalMs / 1000).toFixed(1)}s</b>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">Pool / Max Cards</span>
                  <b className="text-cyan-400">{r.cartelaPoolSize} pool • {r.maxCartelasPerUser ?? 2} max</b>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">Min Players / Rounds</span>
                  <b className="text-white">{r.minPlayers} min • {r.totalRounds} played</b>
                </div>
              </div>

              {isSuperAdmin && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => openEdit(r)}
                    className="flex-1 py-2 rounded-xl bg-[#162038] hover:bg-blue-600 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition"
                  >
                    <Settings2 className="w-3.5 h-3.5" /> Edit Room
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleDelete(r)}
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

      {/* Room Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg bg-[#0f1422] border border-[#1e2742] rounded-2xl p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-base font-black text-white">
              {editingId ? "Edit Bingo Room" : "Create New Bingo Room"}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Amharic Name</label>
                <input
                  type="text"
                  required
                  value={nameAm}
                  onChange={(e) => setNameAm(e.target.value)}
                  className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">English Name</label>
                <input
                  type="text"
                  required
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Stake (ETB)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(Number(e.target.value))}
                  className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">House Cut (%)</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  required
                  value={houseCutPercent}
                  onChange={(e) => setHouseCutPercent(Number(e.target.value))}
                  className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Min Players</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={minPlayers}
                  onChange={(e) => setMinPlayers(Number(e.target.value))}
                  className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Countdown (s)</label>
                <input
                  type="number"
                  min="5"
                  max="300"
                  required
                  value={countdownSeconds}
                  onChange={(e) => setCountdownSeconds(Number(e.target.value))}
                  className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Ball Interval (ms)</label>
                <input
                  type="number"
                  min="1000"
                  max="15000"
                  step="100"
                  required
                  value={callIntervalMs}
                  onChange={(e) => setCallIntervalMs(Number(e.target.value))}
                  className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Cartelas Pool</label>
                <input
                  type="number"
                  min="10"
                  max="600"
                  required
                  value={cartelaPoolSize}
                  onChange={(e) => setCartelaPoolSize(Number(e.target.value))}
                  className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Winning Pattern</label>
                <select
                  value={winningPattern}
                  onChange={(e) =>
                    setWinningPattern(e.target.value as AdminRoomRow["winningPattern"])
                  }
                  className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="ONE_LINE">One Line / 4 Corners</option>
                  <option value="TWO_LINES">Two Lines</option>
                  <option value="FOUR_CORNERS">Four Corners</option>
                  <option value="X_SHAPE">X Shape</option>
                  <option value="FULL_HOUSE">Full House</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Max Cards / Player</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  required
                  value={maxCartelasPerUser}
                  onChange={(e) => setMaxCartelasPerUser(Number(e.target.value))}
                  className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Sort Order</label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="w-full bg-[#0a0e18] border border-[#1e2742] rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span>Room Active (Visible to Players)</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={freeCenter}
                  onChange={(e) => setFreeCenter(e.target.checked)}
                />
                <span>Free Center Star</span>
              </label>
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
                {editingId ? "Save Changes" : "Create Room"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
