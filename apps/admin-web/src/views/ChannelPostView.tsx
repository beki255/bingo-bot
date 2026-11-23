import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Share2,
  Send,
  CheckCircle,
  ImagePlus,
  Video,
  Trash2,
  Gamepad2,
  ClipboardPaste,
  Save,
  Radio,
  Users,
  AlertCircle,
} from "lucide-react";
import { adminFetch } from "../api";

interface PostResultItem {
  targetType: "CHANNEL" | "GROUP";
  chatTarget: string;
  ok: boolean;
  error?: string;
}

export const ChannelPostView: React.FC = () => {
  const [channelTarget, setChannelTarget] = useState("");
  const [groupTarget, setGroupTarget] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSavedMsg, setConfigSavedMsg] = useState<string | null>(null);

  const [target, setTarget] = useState<"BOTH" | "CHANNEL" | "GROUP">("BOTH");
  const [message, setMessage] = useState("");
  const [mediaType, setMediaType] = useState<"photo" | "video" | null>(null);
  const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null);
  const [mediaFileName, setMediaFileName] = useState<string | null>(null);
  const [mediaSizeLabel, setMediaSizeLabel] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<PostResultItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/channel-post/config")
      .then((res) => {
        if (res.ok) {
          setChannelTarget(res.channelTarget || "");
          setGroupTarget(res.groupTarget || "");
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setConfigSavedMsg(null);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/channel-post/config", {
        method: "PUT",
        body: JSON.stringify({
          channelTarget: channelTarget.trim(),
          groupTarget: groupTarget.trim(),
        }),
      });
      if (res.ok) {
        setConfigSavedMsg("Channel and Group links saved!");
        setTimeout(() => setConfigSavedMsg(null), 3500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save links");
    } finally {
      setSavingConfig(false);
    }
  };

  const clearMedia = () => {
    setMediaType(null);
    setMediaDataUrl(null);
    setMediaFileName(null);
    setMediaSizeLabel(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const processMediaFile = useCallback((file: File, fallbackType?: "photo" | "video") => {
    const isVideo = file.type.startsWith("video/") || fallbackType === "video";
    const isImage = file.type.startsWith("image/") || fallbackType === "photo";
    if (!isVideo && !isImage) {
      setError("Unsupported file type. Please paste or select an image or video.");
      return;
    }

    const detectedType: "photo" | "video" = isVideo ? "video" : "photo";
    const maxBytes = detectedType === "video" ? 30 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(
        detectedType === "video"
          ? "Video size must be under 30 MB."
          : "Photo size must be under 10 MB."
      );
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setMediaType(detectedType);
        setMediaDataUrl(reader.result);
        const ext = file.type.split("/")[1] || (detectedType === "video" ? "mp4" : "png");
        setMediaFileName(file.name && file.name !== "image.png" ? file.name : `pasted-${Date.now()}.${ext}`);
        const sizeMb = file.size / (1024 * 1024);
        setMediaSizeLabel(
          sizeMb >= 1 ? `${sizeMb.toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`
        );
      }
    };
    reader.onerror = () => {
      setError("Failed to read file.");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "photo" | "video") => {
    const file = e.target.files?.[0];
    if (!file) return;
    processMediaFile(file, type);
  };

  // Global & local clipboard paste handler (Ctrl+V anywhere on the page or in the message box)
  useEffect(() => {
    const handleWindowPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/") || item.type.startsWith("video/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processMediaFile(file);
            return;
          }
        }
      }

      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
          e.preventDefault();
          processMediaFile(file);
        }
      }
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [processMediaFile]);

  const handlePasteFromClipboardButton = async () => {
    try {
      if (!navigator.clipboard?.read) {
        setError("Press Ctrl+V (or Cmd+V) directly on the page to paste your copied image.");
        return;
      }
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split("/")[1] || "png";
          const file = new File([blob], `pasted-photo.${ext}`, { type: imageType });
          processMediaFile(file, "photo");
          return;
        }
      }
      setError("No copied image found in clipboard. Copy an image first or press Ctrl+V.");
    } catch {
      setError("Press Ctrl+V (or Cmd+V) anywhere on this page to paste your copied image.");
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !mediaDataUrl) {
      setError("Please enter a message or attach a photo/video.");
      return;
    }
    if ((target === "BOTH" || target === "CHANNEL") && !channelTarget.trim() && target === "CHANNEL") {
      setError("Please enter your Telegram Channel link or @username.");
      return;
    }
    if ((target === "BOTH" || target === "GROUP") && !groupTarget.trim() && target === "GROUP") {
      setError("Please enter your Telegram Group link or @username.");
      return;
    }
    if (target === "BOTH" && !channelTarget.trim() && !groupTarget.trim()) {
      setError("Please enter your Channel and/or Group link (@username or https://t.me/...) first.");
      return;
    }

    setSending(true);
    setError(null);
    setResults(null);
    try {
      const res = await adminFetch("/api/admin/channel-post", {
        method: "POST",
        body: JSON.stringify({
          target,
          message: message.trim(),
          mediaType,
          mediaDataUrl,
          mediaFileName,
          channelTarget: channelTarget.trim(),
          groupTarget: groupTarget.trim(),
        }),
      });
      if (Array.isArray(res.results)) {
        setResults(res.results);
      }
      if (res.ok) {
        setMessage("");
        clearMedia();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish post");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-3xl flex flex-col gap-6 animate-fadeIn">
      {/* 1. Channel & Group Destination Configuration Card */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-6 shadow-sm dark:shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Telegram Channel &amp; Group Links
              </h3>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Make sure <b>@Zemen_Bingo_et_bot</b> is added as an <b>Admin</b> in your Channel and Group.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-600/20 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingConfig ? "Saving..." : "Save Links"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-gray-300 block mb-1.5">
              Telegram Channel (@username, t.me link, or -100... ID)
            </label>
            <input
              type="text"
              placeholder="e.g. https://t.me/zemen_bingo or @zemen_bingo"
              value={channelTarget}
              onChange={(e) => setChannelTarget(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] focus:border-purple-500 focus:outline-none rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-gray-300 block mb-1.5">
              Telegram Group (@username, t.me link, or -100... ID)
            </label>
            <input
              type="text"
              placeholder="e.g. https://t.me/zemen_bingo_group or @zemen_bingo_group"
              value={groupTarget}
              onChange={(e) => setGroupTarget(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] focus:border-purple-500 focus:outline-none rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {configSavedMsg && (
          <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{configSavedMsg}</span>
          </div>
        )}
      </div>

      {/* 2. Post Composer Card */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-6 shadow-sm dark:shadow-xl flex flex-col gap-5">
        <form onSubmit={handleSend} className="flex flex-col gap-5">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-gray-300 block mb-2">
              Where to Post
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  ["BOTH", "Both Channel & Group", "በአንድ ጊዜ ለሁለቱም"],
                  ["CHANNEL", "Channel Only", "ለቻናል ብቻ"],
                  ["GROUP", "Group Only", "ለግሩፕ ብቻ"],
                ] as const
              ).map(([id, label, sub]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTarget(id)}
                  className={`p-3.5 rounded-xl border text-left transition ${
                    target === id
                      ? "bg-purple-600/15 dark:bg-purple-600/20 border-purple-500 text-slate-900 dark:text-white"
                      : "bg-slate-50 dark:bg-[#0a0e18] border-slate-200 dark:border-[#1a233b] text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{label}</span>
                    {id === "GROUP" ? (
                      <Users className="w-3.5 h-3.5 text-purple-500" />
                    ) : (
                      <Radio className="w-3.5 h-3.5 text-purple-500" />
                    )}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Photo & Video Attachment Controls (File Upload + Copy/Paste Ctrl+V + Drag & Drop) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer?.files?.[0];
              if (file) processMediaFile(file);
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 dark:text-gray-300">
                Attach Photo or Video (Optional)
              </label>
              <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                💡 Tip: Copy &amp; Paste (Ctrl+V) any image directly on this page!
              </span>
            </div>

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
              <div
                className={`grid grid-cols-1 sm:grid-cols-3 gap-3 p-1 rounded-xl transition ${
                  isDragging ? "ring-2 ring-purple-500 bg-purple-500/10" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 p-3.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-[#1e2742] hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50/70 dark:bg-[#0a0e18] text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition text-xs font-bold"
                >
                  <ImagePlus className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>Upload Photo</span>
                </button>

                <button
                  type="button"
                  onClick={handlePasteFromClipboardButton}
                  className="flex items-center justify-center gap-2 p-3.5 rounded-xl border-2 border-dashed border-emerald-400/60 dark:border-emerald-500/40 hover:border-emerald-500 bg-emerald-500/5 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 transition text-xs font-bold"
                >
                  <ClipboardPaste className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Paste Image (Ctrl+V)</span>
                </button>

                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 p-3.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-[#1e2742] hover:border-purple-500 dark:hover:border-purple-500 bg-slate-50/70 dark:bg-[#0a0e18] text-slate-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition text-xs font-bold"
                >
                  <Video className="w-4 h-4 text-purple-500 shrink-0" />
                  <span>Upload Video</span>
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
                      alt="Post preview"
                      className="max-h-60 w-auto object-contain"
                    />
                  ) : (
                    <video src={mediaDataUrl} controls className="max-h-60 w-auto" />
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-gray-300 block mb-1.5">
              Post Text {mediaDataUrl ? "(Caption - Optional)" : "(Amharic or English)"}
            </label>
            <textarea
              rows={5}
              placeholder="🔥 የዘመን ቢንጎ የቀጥታ ጨዋታ ተጀምሯል! ከታች ያለውን Play Bingo በተን በመጫን አሁኑኑ ይቀላቀሉ..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1e2742] focus:border-purple-500 focus:outline-none rounded-xl p-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-600"
            />
            <div className="mt-2 flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                Automatically attaches the <b>&ldquo;🎮 ቢንጎ ተጫወት (Play Bingo)&rdquo;</b> button under the post (opens Mini App if registered, or takes unregistered users to the bot to register first).
              </span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {results && (
            <div className="flex flex-col gap-2">
              {results.map((r, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border text-xs flex items-center gap-3 ${
                    r.ok
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                      : "bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {r.ok ? (
                    <CheckCircle className="w-5 h-5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 shrink-0" />
                  )}
                  <div>
                    <b>{r.targetType === "CHANNEL" ? "📢 Channel" : "👥 Group"} ({r.chatTarget || "-"}):</b>{" "}
                    {r.ok ? "Posted successfully!" : r.error || "Failed to post"}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={sending || (!message.trim() && !mediaDataUrl)}
            className="w-full sm:w-fit px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>
              {sending
                ? "Publishing Post..."
                : target === "BOTH"
                ? "Post to Both Channel & Group"
                : target === "CHANNEL"
                ? "Post to Channel"
                : "Post to Group"}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};
