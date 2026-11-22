import React, { useEffect, useRef, useState } from "react";
import { Megaphone, Send, Users, CheckCircle, ImagePlus, Video, Trash2, Gamepad2 } from "lucide-react";
import { adminFetch } from "../api";

export const BroadcastView: React.FC = () => {
  const [counts, setCounts] = useState<{ ALL: number; VERIFIED: number; ACTIVE_7D: number }>({
    ALL: 0,
    VERIFIED: 0,
    ACTIVE_7D: 0,
  });
  const [target, setTarget] = useState<"ALL" | "VERIFIED" | "ACTIVE_7D">("ALL");
  const [message, setMessage] = useState("");
  const [mediaType, setMediaType] = useState<"photo" | "video" | null>(null);
  const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null);
  const [mediaFileName, setMediaFileName] = useState<string | null>(null);
  const [mediaSizeLabel, setMediaSizeLabel] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ total: number; sent: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/broadcast/audience")
      .then((res) => {
        if (res.ok && res.counts) setCounts(res.counts);
      })
      .catch(() => {});
  }, []);

  const clearMedia = () => {
    setMediaType(null);
    setMediaDataUrl(null);
    setMediaFileName(null);
    setMediaSizeLabel(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "photo" | "video") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxBytes = type === "video" ? 30 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(
        type === "video"
          ? "Video size must be under 30 MB."
          : "Photo size must be under 10 MB."
      );
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setMediaType(type);
        setMediaDataUrl(reader.result);
        setMediaFileName(file.name);
        const sizeMb = file.size / (1024 * 1024);
        setMediaSizeLabel(sizeMb >= 1 ? `${sizeMb.toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`);
      }
    };
    reader.onerror = () => {
      setError("Failed to read file.");
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !mediaDataUrl) {
      setError("Please enter a message or attach a photo/video.");
      return;
    }
    if (!confirm(`Send this broadcast to ${counts[target]} Telegram users right now?`)) return;

    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await adminFetch("/api/admin/broadcast", {
        method: "POST",
        body: JSON.stringify({
          target,
          message: message.trim(),
          mediaType,
          mediaDataUrl,
          mediaFileName,
        }),
      });
      if (res.ok) {
        setResult({ total: res.total, sent: res.sent, failed: res.failed });
        setMessage("");
        clearMedia();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Broadcast failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-3xl flex flex-col gap-6 animate-fadeIn">
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-6 shadow-sm dark:shadow-xl flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Telegram Broadcast Center</h3>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              Send messages, photos, or videos with a direct Play Mini App button to your Telegram players.
            </p>
          </div>
        </div>

        <form onSubmit={handleSend} className="flex flex-col gap-5">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-gray-300 block mb-2">Target Audience</label>
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
                      ? "bg-blue-600/15 dark:bg-blue-600/20 border-blue-500 text-slate-900 dark:text-white"
                      : "bg-slate-50 dark:bg-[#0a0e18] border-slate-200 dark:border-[#1a233b] text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{label}</span>
                    <Users className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                  </div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">{count.toLocaleString()}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Photo & Video Attachment Controls */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-gray-300 block mb-2">
              Attach Photo or Video (Optional)
            </label>

            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange(e, "photo")}
              className="hidden"
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => handleFileChange(e, "video")}
              className="hidden"
            />

            {!mediaDataUrl ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="flex items-center justify-center gap-2.5 p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-[#1e2742] hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50/70 dark:bg-[#0a0e18] text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition text-xs font-bold"
                >
                  <ImagePlus className="w-4 h-4 text-blue-500" />
                  <span>Attach Photo (JPG, PNG, WebP)</span>
                </button>

                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="flex items-center justify-center gap-2.5 p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-[#1e2742] hover:border-purple-500 dark:hover:border-purple-500 bg-slate-50/70 dark:bg-[#0a0e18] text-slate-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition text-xs font-bold"
                >
                  <Video className="w-4 h-4 text-purple-500" />
                  <span>Attach Video (MP4, WebM)</span>
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-white truncate">
                    {mediaType === "photo" ? (
                      <ImagePlus className="w-4 h-4 text-blue-500 shrink-0" />
                    ) : (
                      <Video className="w-4 h-4 text-purple-500 shrink-0" />
                    )}
                    <span className="truncate">{mediaFileName || "Attached Media"}</span>
                    {mediaSizeLabel && (
                      <span className="text-[11px] text-slate-400 dark:text-gray-500 font-normal shrink-0">
                        ({mediaSizeLabel})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={clearMedia}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center gap-1 transition shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>

                <div className="rounded-xl overflow-hidden bg-black/40 max-h-64 flex items-center justify-center border border-slate-200 dark:border-[#1a233b]">
                  {mediaType === "photo" ? (
                    <img
                      src={mediaDataUrl}
                      alt="Broadcast preview"
                      className="max-h-60 w-auto object-contain"
                    />
                  ) : (
                    <video
                      src={mediaDataUrl}
                      controls
                      className="max-h-60 w-auto"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-gray-300 block mb-1.5">
              Message {mediaDataUrl ? "(Caption - Optional)" : "(Amharic or English)"}
            </label>
            <textarea
              rows={5}
              placeholder="🎉 ዛሬ ልዩ የቢንጎ ውድድር ተጀምሯል! ከታች ያለውን Play በተን በመጫን ይጫወቱ..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl p-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-600"
            />
            <div className="mt-2 flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                Every broadcast automatically includes the <b>&ldquo;🎮 ቢንጎ ተጫወት (Play)&rdquo;</b> button that opens the Mini App directly.
              </span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-300">
              {error}
            </div>
          )}

          {result && (
            <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <div>
                <b>Broadcast Completed!</b> Delivered to <b>{result.sent}</b> of {result.total} users
                {result.failed > 0 ? ` (${result.failed} blocked bot or unreachable)` : ""}.
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={sending || counts[target] === 0 || (!message.trim() && !mediaDataUrl)}
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
