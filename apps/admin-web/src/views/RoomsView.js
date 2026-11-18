import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Gamepad2, Settings2, CheckCircle, XCircle } from "lucide-react";
import { adminFetch } from "../api";
export const RoomsView = () => {
    const [rooms, setRooms] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [editingRoom, setEditingRoom] = useState(null);
    const [nameEn, setNameEn] = useState("");
    const [nameAm, setNameAm] = useState("");
    const [stakeAmount, setStakeAmount] = useState(10);
    const [houseCutPercent, setHouseCutPercent] = useState(20);
    const [countdownSeconds, setCountdownSeconds] = useState(30);
    const [isActive, setIsActive] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const fetchRooms = async () => {
        setIsLoading(true);
        try {
            const res = await adminFetch("/api/admin/rooms");
            if (res.ok) {
                setRooms(res.rooms || []);
            }
        }
        catch { }
        setIsLoading(false);
    };
    useEffect(() => {
        fetchRooms();
    }, []);
    const showToast = (message, type = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };
    const handleOpenEdit = (r) => {
        setEditingRoom(r);
        setNameEn(r.nameEn);
        setNameAm(r.nameAm);
        setStakeAmount(r.stakeAmount);
        setHouseCutPercent(r.houseCutPercent);
        setCountdownSeconds(r.countdownSeconds);
        setIsActive(r.isActive);
    };
    const handleSave = async (e) => {
        e.preventDefault();
        if (!editingRoom)
            return;
        setActionLoading(true);
        try {
            const payload = {
                nameEn,
                nameAm,
                stakeAmount,
                houseCutPercent,
                countdownSeconds,
                isActive,
            };
            await adminFetch(`/api/admin/rooms/${editingRoom.id}`, {
                method: "PUT",
                body: JSON.stringify(payload),
            });
            showToast("Room settings updated successfully!");
            setEditingRoom(null);
            fetchRooms();
        }
        catch (err) {
            showToast(err.message || "Failed to update room", "error");
        }
        finally {
            setActionLoading(false);
        }
    };
    return (_jsxs("div", { className: "p-8 flex flex-col gap-6 animate-fadeIn", children: [toast && (_jsx("div", { className: `fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold border ${toast.type === "success"
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : "bg-rose-500/20 border-rose-500/40 text-rose-300"}`, children: _jsx("span", { children: toast.message }) })), _jsxs("div", { children: [_jsx("h2", { className: "text-base font-extrabold text-white", children: "Bingo Game Rooms & Stakes" }), _jsx("p", { className: "text-xs text-gray-400 mt-0.5", children: "Configure stake levels, house cut percentages, countdown intervals, and room statuses." })] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5", children: isLoading ? (_jsx("div", { className: "col-span-3 py-12 text-center text-xs text-gray-500", children: "Loading rooms..." })) : rooms.length === 0 ? (_jsx("div", { className: "col-span-3 py-12 text-center text-xs text-gray-500", children: "No rooms found." })) : (rooms.map((r) => (_jsxs("div", { className: "bg-[#0f1422] border border-[#1a233b] rounded-2xl p-6 shadow-xl flex flex-col justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Gamepad2, { className: "w-5 h-5 text-cyan-400" }), _jsx("h3", { className: "text-base font-black text-white", children: r.nameEn })] }), r.isActive ? (_jsxs("span", { className: "flex items-center gap-1 text-[11px] font-bold text-emerald-400", children: [_jsx(CheckCircle, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Active" })] })) : (_jsxs("span", { className: "flex items-center gap-1 text-[11px] font-bold text-rose-400", children: [_jsx(XCircle, { className: "w-3.5 h-3.5" }), _jsx("span", { children: "Paused" })] }))] }), _jsxs("div", { className: "grid grid-cols-2 gap-3 mb-4", children: [_jsxs("div", { className: "bg-[#0a0e18] p-3 rounded-xl border border-[#1a233b]", children: [_jsx("span", { className: "text-[10px] text-gray-400 font-bold block uppercase", children: "Stake Per Card" }), _jsxs("span", { className: "text-lg font-black text-amber-400 font-mono block", children: [r.stakeAmount, " ETB"] })] }), _jsxs("div", { className: "bg-[#0a0e18] p-3 rounded-xl border border-[#1a233b]", children: [_jsx("span", { className: "text-[10px] text-gray-400 font-bold block uppercase", children: "House Cut" }), _jsxs("span", { className: "text-lg font-black text-purple-400 font-mono block", children: [r.houseCutPercent, "%"] })] })] }), _jsxs("div", { className: "flex items-center justify-between text-xs text-gray-400 border-t border-[#1a233b] pt-3", children: [_jsx("span", { children: "Countdown Timer:" }), _jsxs("span", { className: "font-bold text-white font-mono", children: [r.countdownSeconds, "s"] })] })] }), _jsx("div", { className: "pt-4 mt-4 border-t border-[#1a233b]", children: _jsxs("button", { onClick: () => handleOpenEdit(r), className: "w-full py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white text-xs font-bold flex items-center justify-center gap-2 border border-blue-500/30 transition shadow-md", children: [_jsx(Settings2, { className: "w-4 h-4" }), _jsx("span", { children: "Configure Room" })] }) })] }, r.id)))) }), editingRoom && (_jsx("div", { className: "fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4", children: _jsxs("div", { className: "bg-[#0f1422] border border-[#1a233b] rounded-3xl p-6 w-full max-w-md shadow-2xl", children: [_jsxs("h3", { className: "text-lg font-black text-white mb-4", children: ["Configure ", editingRoom.nameEn] }), _jsxs("form", { onSubmit: handleSave, className: "flex flex-col gap-3.5", children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "Name (English)" }), _jsx("input", { type: "text", required: true, value: nameEn, onChange: (e) => setNameEn(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "Name (Amharic)" }), _jsx("input", { type: "text", required: true, value: nameAm, onChange: (e) => setNameAm(e.target.value), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white" })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "Stake Amount (ETB)" }), _jsx("input", { type: "number", min: 1, required: true, value: stakeAmount, onChange: (e) => setStakeAmount(Number(e.target.value)), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white font-mono" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "House Cut (%)" }), _jsx("input", { type: "number", min: 0, max: 50, required: true, value: houseCutPercent, onChange: (e) => setHouseCutPercent(Number(e.target.value)), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white font-mono" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-gray-300 block mb-1", children: "Countdown Duration (Seconds)" }), _jsx("input", { type: "number", min: 10, max: 120, required: true, value: countdownSeconds, onChange: (e) => setCountdownSeconds(Number(e.target.value)), className: "w-full bg-[#0a0e18] border border-[#1e2742] focus:border-blue-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-white font-mono" })] }), _jsxs("div", { className: "flex items-center justify-between py-2 border-t border-[#1a233b] mt-1", children: [_jsx("span", { className: "text-xs font-bold text-gray-300", children: "Room Status (Active)" }), _jsx("input", { type: "checkbox", checked: isActive, onChange: (e) => setIsActive(e.target.checked), className: "w-4 h-4 rounded text-blue-600 bg-[#0a0e18] border-[#1e2742] cursor-pointer" })] }), _jsxs("div", { className: "flex items-center justify-end gap-3 pt-3 border-t border-[#1a233b]", children: [_jsx("button", { type: "button", onClick: () => setEditingRoom(null), className: "px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white", children: "Cancel" }), _jsx("button", { type: "submit", disabled: actionLoading, className: "px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition", children: actionLoading ? "Saving..." : "Save Room Settings" })] })] })] }) }))] }));
};
