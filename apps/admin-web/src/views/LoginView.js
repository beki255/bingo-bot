import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { Lock, KeyRound, AlertCircle, ArrowRight } from "lucide-react";
import { adminFetch, setAuthToken } from "../api";
export const LoginView = ({ onSuccess }) => {
    const [method, setMethod] = useState("password");
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        try {
            const payload = method === "otp"
                ? { loginMethod: "otp", otpCode: otpCode.trim() }
                : { loginMethod: "password", identifier: identifier.trim(), password: password.trim() };
            const res = await adminFetch("/api/admin/auth/login", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            if (res.ok && res.token && res.admin) {
                setAuthToken(res.token);
                localStorage.setItem("bingo_admin_profile", JSON.stringify(res.admin));
                onSuccess(res.admin);
            }
            else {
                throw new Error(res.error || "Login failed");
            }
        }
        catch (err) {
            setError(err.message || "Failed to log in. Please verify your credentials.");
        }
        finally {
            setIsLoading(false);
        }
    };
    return (_jsxs("div", { className: "min-h-screen w-full flex items-center justify-center p-4 bg-[#080b12] relative overflow-hidden", children: [_jsx("div", { className: "absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" }), _jsx("div", { className: "absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" }), _jsxs("div", { className: "w-full max-w-md bg-[#0f1422] border border-[#1e2742] rounded-3xl p-8 shadow-2xl relative z-10", children: [_jsxs("div", { className: "flex flex-col items-center text-center mb-8", children: [_jsx("div", { className: "w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center font-black text-2xl text-white shadow-xl shadow-blue-500/25 mb-4", children: "TB" }), _jsx("h1", { className: "text-2xl font-black text-white tracking-tight", children: "Tunnel Bingo" }), _jsx("p", { className: "text-xs text-gray-400 font-medium mt-1", children: "Management & Cashier Portal" })] }), _jsxs("div", { className: "bg-[#0b0f1a] p-1 rounded-2xl flex items-center border border-[#1a233b] mb-6", children: [_jsxs("button", { type: "button", onClick: () => {
                                    setMethod("password");
                                    setError(null);
                                }, className: `flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${method === "password"
                                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                                    : "text-gray-400 hover:text-gray-200"}`, children: [_jsx(Lock, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Password" })] }), _jsxs("button", { type: "button", onClick: () => {
                                    setMethod("otp");
                                    setError(null);
                                }, className: `flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${method === "otp"
                                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                                    : "text-gray-400 hover:text-gray-200"}`, children: [_jsx(KeyRound, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Telegram OTP" })] })] }), error && (_jsxs("div", { className: "mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-400 text-xs font-medium", children: [_jsx(AlertCircle, { className: "w-4 h-4 shrink-0 mt-0.5" }), _jsx("span", { children: error })] })), _jsxs("form", { onSubmit: handleSubmit, className: "flex flex-col gap-4", children: [method === "password" ? (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1.5", children: "Identifier (Phone / Username / Telegram ID)" }), _jsx("input", { type: "text", placeholder: "e.g. 7748253327 or admin", value: identifier, onChange: (e) => setIdentifier(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 transition" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1.5", children: "Admin Password" }), _jsx("input", { type: "password", placeholder: "Enter your admin password", required: true, value: password, onChange: (e) => setPassword(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 transition" })] })] })) : (_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1.5", children: "6-Digit Telegram One-Time Code" }), _jsx("input", { type: "text", placeholder: "123456", required: true, maxLength: 6, value: otpCode, onChange: (e) => setOtpCode(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-4 py-3 text-xl text-center tracking-[0.4em] font-black text-cyan-400 placeholder-gray-700 transition" }), _jsxs("p", { className: "text-[11px] text-gray-500 mt-2 leading-relaxed", children: ["\uD83D\uDCA1 Open the Telegram Bot ", _jsx("b", { children: "@tunnel_bingo_bot" }), ", send ", _jsx("code", { children: "/admin" }), ", and click ", _jsx("b", { children: "\uD83D\uDD10 \u12E8Web \u1218\u130D\u1262\u12EB \u12AE\u12F5" }), " to receive your instant 6-digit login code."] })] })), _jsx("button", { type: "submit", disabled: isLoading, className: "w-full mt-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition disabled:opacity-50", children: isLoading ? (_jsx("span", { children: "Authenticating..." })) : (_jsxs(_Fragment, { children: [_jsx("span", { children: "Sign In to Admin Portal" }), _jsx(ArrowRight, { className: "w-4 h-4" })] })) })] }), _jsx("div", { className: "mt-8 text-center border-t border-[#1a233b] pt-4", children: _jsx("span", { className: "text-[11px] text-gray-500", children: "Protected Console \u2022 Authorized Operations Personnel Only" }) })] })] }));
};
