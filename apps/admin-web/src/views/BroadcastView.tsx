import React, { useEffect, useState } from "react";
import { Megaphone, Send, Users, CheckCircle } from "lucide-react";
import { adminFetch } from "../api";

export const BroadcastView: React.FC = () => {
  const [counts, setCounts] = useState<{ ALL: number; VERIFIED: number; ACTIVE_7D: number }>({
    ALL: 0,
    VERIFIED: 0,
    ACTIVE_7D: 0,
  });
  const [target, setTarget] = useState<"ALL" | "VERIFIED" | "ACTIVE_7D">("ALL");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ total: number; sent: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/broadcast/audience")
      .then((res) => {
        if (res.ok && res.counts) setCounts(res.counts);
      })
      .catch(() => {});
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    if (!confirm(`Send this announcement to ${counts[target]} Telegram users right now?`)) return;

    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await adminFetch("/api/admin/broadcast", {
        method: "POST",
        body: JSON.stringify({ target, message: message.trim() }),
      });
      if (res.ok) {
        setResult({ total: res.total, sent: res.sent, failed: res.failed });
        setMessage("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Broadcast failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-3xl flex flex-col gap-6 animate-fadeIn">
      <div className="bg-[#0f1422] border border-[#1a233b] rounded-2xl p-6 shadow-xl flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-white">Telegram Broadcast Center</h3>
            <p className="text-xs text-gray-400">
              Send promotions, bonus alerts, or maintenance announcements directly via @tunnel_bingo_bot.
            </p>
          </div>
        </div>

        <form onSubmit={handleSend} className="flex flex-col gap-5">
          <div>
            <label className="text-xs font-bold text-gray-300 block mb-2">Target Audience</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  ["ALL", "All Players", counts.ALL],
                  ["VERIFIED", "Verified Phones", counts.VERIFIED],
                  ["ACTIVE_7D", "Active (Last 7d)", counts.ACTIVE_7D],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTarget(id)}
                  className={`p-3.5 rounded-xl border text-left transition ${
                    target === id
                      ? "bg-blue-600/20 border-blue-500 text-white"
                      : "bg-[#0a0e18] border-[#1a233b] text-gray-400 hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{label}</span>
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="text-lg font-black text-white">{count.toLocaleString()}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1.5">
              Announcement Message (Amharic or English)
            </label>
            <textarea
              rows={6}
              required
              placeholder="🎉 ዛሬ ልዩ የቢንጎ ውድድር ተጀምሯል! ወደ ቦቱ ገብተው ይጫወቱ..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl p-4 text-sm text-white placeholder-gray-600"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
              {error}
            </div>
          )}

          {result && (
            <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <div>
                <b>Broadcast Completed!</b> Delivered to <b>{result.sent}</b> of {result.total} users
                {result.failed > 0 ? ` (${result.failed} blocked bot or unreachable)` : ""}.
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={sending || counts[target] === 0}
            className="w-full sm:w-fit px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>
              {sending
                ? "Sending Broadcast..."
                : `Send Broadcast to ${counts[target]} Users`}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};
