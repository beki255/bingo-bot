import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { adminFetch } from "../api";
export const AuditLogsView = () => {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const res = await adminFetch("/api/admin/audit-logs");
            if (res.ok) {
                setLogs(res.logs || []);
            }
        }
        catch { }
        setIsLoading(false);
    };
    useEffect(() => {
        fetchLogs();
    }, []);
    return (_jsxs("div", { className: "p-8 flex flex-col gap-6 animate-fadeIn", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-base font-extrabold text-white", children: "System Audit Trail" }), _jsx("p", { className: "text-xs text-gray-400 mt-0.5", children: "Immutable security logs of administrative logins, approvals, rejections, and setting changes." })] }), _jsx("div", { className: "bg-[#0f1422] border border-[#1a233b] rounded-2xl overflow-hidden shadow-xl", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-sm", children: [_jsx("thead", { className: "bg-[#0a0e18] text-gray-400 text-[11px] font-black uppercase tracking-wider border-b border-[#1a233b]", children: _jsxs("tr", { children: [_jsx("th", { className: "py-4 px-6", children: "Timestamp" }), _jsx("th", { className: "py-4 px-6", children: "Actor" }), _jsx("th", { className: "py-4 px-6", children: "Role" }), _jsx("th", { className: "py-4 px-6", children: "Action" }), _jsx("th", { className: "py-4 px-6", children: "Target" }), _jsx("th", { className: "py-4 px-6", children: "Details" })] }) }), _jsx("tbody", { className: "divide-y divide-[#1a233b]", children: isLoading ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "py-12 text-center text-xs text-gray-500", children: "Loading audit trail..." }) })) : logs.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "py-12 text-center text-xs text-gray-500", children: "No audit records registered yet." }) })) : (logs.map((l) => (_jsxs("tr", { className: "hover:bg-[#141b2d]/50 transition text-xs", children: [_jsx("td", { className: "py-4 px-6 font-mono text-gray-400 whitespace-nowrap", children: new Date(l.createdAt).toLocaleString() }), _jsx("td", { className: "py-4 px-6 font-bold text-white whitespace-nowrap", children: l.actorName }), _jsx("td", { className: "py-4 px-6 whitespace-nowrap", children: _jsx("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-cyan-400 border border-blue-500/20", children: l.actorRole }) }), _jsx("td", { className: "py-4 px-6 font-mono font-bold text-gray-200 whitespace-nowrap", children: l.action }), _jsxs("td", { className: "py-4 px-6 text-gray-400 whitespace-nowrap", children: [l.targetType, " #", l.targetId.substring(0, 8)] }), _jsx("td", { className: "py-4 px-6 font-mono text-[11px] text-gray-500 max-w-xs truncate", children: l.details ? JSON.stringify(l.details) : "-" })] }, l.id)))) })] }) }) })] }));
};
