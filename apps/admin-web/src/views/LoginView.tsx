import React, { useState } from "react";
import { Lock, KeyRound, AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { adminFetch, setAuthToken } from "../api";
import type { AdminProfile } from "../types";

interface LoginViewProps {
  onSuccess: (admin: AdminProfile) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const [method, setMethod] = useState<"password" | "otp">("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const payload =
        method === "otp"
          ? { loginMethod: "otp", otpCode: otpCode.trim() }
          : { loginMethod: "password", identifier: identifier.trim(), password };

      const res = await adminFetch<{ ok: boolean; token: string; admin: AdminProfile; error?: string }>(
        "/api/admin/auth/login",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      if (res.ok && res.token && res.admin) {
        setAuthToken(res.token);
        localStorage.setItem("bingo_admin_profile", JSON.stringify(res.admin));
        onSuccess(res.admin);
      } else {
        throw new Error(res.error || "Login failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log in. Verify credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#080b12] relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-[#0f1422] border border-[#1e2742] rounded-3xl p-8 shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center font-black text-2xl text-white shadow-xl shadow-blue-500/30 mb-4">
            ZB
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Zemen Bingo</h1>
          <p className="text-xs text-gray-400 font-medium mt-1">
            Admin Management &amp; Operations Portal
          </p>
        </div>

        <div className="bg-[#0a0e18] p-1 rounded-2xl flex items-center border border-[#1a233b] mb-6">
          <button
            type="button"
            onClick={() => {
              setMethod("password");
              setError(null);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              method === "password"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Username &amp; Password</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMethod("otp");
              setError(null);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              method === "otp"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Telegram OTP</span>
          </button>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-400 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {method === "password" ? (
            <>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1.5">
                  Admin Username / Phone / Telegram ID
                </label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="e.g. admin or 7748253327"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 transition"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="Enter admin password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-gray-600 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1.5">
                6-Digit Telegram One-Time Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                className="w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-4 py-3 text-xl text-center tracking-[0.4em] font-black text-cyan-400 placeholder-gray-700 transition"
              />
              <p className="text-[11px] text-gray-400 mt-2.5 leading-relaxed">
                Open <b>@Zemen_Bingo_et_bot</b>, send <code>/admin</code>, and tap{" "}
                <b>🔐 Web Login Code</b> to generate a 5-minute 6-digit login code.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition disabled:opacity-50"
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In to Admin Portal</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-7 text-center border-t border-[#1a233b] pt-4">
          <span className="text-[11px] text-gray-500">
            Protected Console • Authorized Personnel Only
          </span>
        </div>
      </div>
    </div>
  );
};
