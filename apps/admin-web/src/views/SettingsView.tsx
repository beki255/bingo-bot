import React, { useEffect, useState } from "react";
import { Gift, DollarSign, AlertTriangle, Save, KeyRound } from "lucide-react";
import { adminFetch } from "../api";
import type { AdminProfile, SystemSettingsData } from "../types";

interface SettingsViewProps {
  admin: AdminProfile;
  onAdminUpdated: (next: AdminProfile) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ admin, onAdminUpdated }) => {
  const isSuperAdmin = admin.role === "SUPER_ADMIN";
  const [settings, setSettings] = useState<SystemSettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Own Credentials Form
  const [credUsername, setCredUsername] = useState(admin.username || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [credSaving, setCredSaving] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    setIsLoading(true);
    adminFetch("/api/admin/settings")
      .then((res) => {
        if (res.ok && res.settings) setSettings(res.settings);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || !isSuperAdmin) return;
    setIsSaving(true);
    try {
      const res = await adminFetch("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        showToast("System settings updated successfully!");
        setSettings(res.settings);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save settings", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (credUsername.trim() && credUsername.trim() !== admin.username) {
        payload.username = credUsername.trim();
      }
      if (newPassword.trim()) {
        payload.newPassword = newPassword.trim();
        if (currentPassword.trim()) payload.currentPassword = currentPassword.trim();
      }
      if (Object.keys(payload).length === 0) {
        showToast("Enter a new username or new password to update.", "error");
        setCredSaving(false);
        return;
      }
      const res = await adminFetch("/api/admin/auth/credentials", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (res.ok && res.admin) {
        localStorage.setItem("bingo_admin_profile", JSON.stringify(res.admin));
        onAdminUpdated(res.admin);
        setCurrentPassword("");
        setNewPassword("");
        showToast("Your Admin login username & password were updated!");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update credentials", "error");
    } finally {
      setCredSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl flex flex-col gap-6 animate-fadeIn">
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

      {/* Own Admin Login Credentials Card (Available to every Admin / Cashier) */}
      <form
        onSubmit={handleSaveCredentials}
        className="bg-[#0f1422] border border-blue-500/30 rounded-2xl p-6 shadow-xl flex flex-col gap-4"
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white">
                My Admin Web Login (Username &amp; Password)
              </h3>
              <p className="text-xs text-gray-400">
                Change the username and password you use to sign in at <code>/admin</code>.
              </p>
            </div>
          </div>
          <button
            type="submit"
            disabled={credSaving}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{credSaving ? "Updating..." : "Update Login"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">Admin Username</label>
            <input
              type="text"
              placeholder="e.g. admin"
              value={credUsername}
              onChange={(e) => setCredUsername(e.target.value)}
              className="w-full bg-[#0a0e18] border border-[#1a233b] rounded-xl px-3.5 py-2.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">
              Current Password (if changing password)
            </label>
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-[#0a0e18] border border-[#1a233b] rounded-xl px-3.5 py-2.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">
              New Password (6+ characters)
            </label>
            <input
              type="password"
              placeholder="Leave empty to keep current"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-[#0a0e18] border border-[#1a233b] rounded-xl px-3.5 py-2.5 text-xs text-white"
            />
          </div>
        </div>
      </form>

      {/* System Settings (Super Admin Editable) */}
      {isLoading || !settings ? (
        <div className="p-8 text-center text-xs text-gray-500">Loading system settings...</div>
      ) : (
        <form onSubmit={handleSaveSettings} className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-white">System Configuration</h2>
              <p className="text-xs text-gray-400">
                Financial limits, bonuses, bot branding, welcome banner, and maintenance killswitch.
              </p>
            </div>
            {isSuperAdmin && (
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? "Saving..." : "Save System Settings"}</span>
              </button>
            )}
          </div>

          {/* Maintenance Killswitch */}
          <div
            className={`p-6 rounded-2xl border transition ${
              settings.maintenanceMode
                ? "bg-rose-500/10 border-rose-500/30"
                : "bg-[#0f1422] border-[#1a233b]"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <AlertTriangle
                  className={`w-5 h-5 ${settings.maintenanceMode ? "text-rose-400" : "text-amber-400"}`}
                />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    System Maintenance Mode (Killswitch)
                  </h3>
                  <p className="text-xs text-gray-400">
                    When enabled, players cannot deposit, withdraw, or join bingo rounds.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                disabled={!isSuperAdmin}
                checked={settings.maintenanceMode}
                onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                className="w-5 h-5 cursor-pointer"
              />
            </div>

            {settings.maintenanceMode && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-rose-500/20">
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">
                    Amharic Maintenance Message
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={settings.maintenanceMessageAm || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, maintenanceMessageAm: e.target.value })
                    }
                    className="w-full bg-[#0a0e18] border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">
                    English Maintenance Message
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={settings.maintenanceMessageEn || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, maintenanceMessageEn: e.target.value })
                    }
                    className="w-full bg-[#0a0e18] border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Rewards & Bonuses */}
          <div className="bg-[#0f1422] border border-[#1a233b] rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <Gift className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-extrabold text-white">Bonuses &amp; Referrals</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-[#0a0e18] p-4 rounded-xl border border-[#1a233b] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Welcome Signup Bonus</span>
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={settings.welcomeBonusEnabled}
                    onChange={(e) =>
                      setSettings({ ...settings, welcomeBonusEnabled: e.target.checked })
                    }
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Bonus Amount (ETB)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={!isSuperAdmin}
                    value={settings.welcomeBonusAmount}
                    onChange={(e) =>
                      setSettings({ ...settings, welcomeBonusAmount: Number(e.target.value) })
                    }
                    className="w-full bg-[#0f1422] border border-[#1a233b] rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="bg-[#0a0e18] p-4 rounded-xl border border-[#1a233b] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Referral Bonus Program</span>
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={settings.referralBonusEnabled}
                    onChange={(e) =>
                      setSettings({ ...settings, referralBonusEnabled: e.target.checked })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Trigger Mode</label>
                    <select
                      disabled={!isSuperAdmin}
                      value={settings.referralTriggerType}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          referralTriggerType: e.target.value as SystemSettingsData["referralTriggerType"],
                        })
                      }
                      className="w-full bg-[#0f1422] border border-[#1a233b] rounded-xl px-2.5 py-2 text-[11px] text-white"
                    >
                      <option value="ON_SIGNUP_VERIFIED">10 Verified Signups</option>
                      <option value="ON_FIRST_DEPOSIT">First Deposit</option>
                      <option value="ON_EVERY_DEPOSIT_PERCENT">Every Deposit %</option>
                      <option value="ON_EVERY_BET_PERCENT">Every Bet %</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Value (ETB or %)</label>
                    <input
                      type="number"
                      min={0}
                      disabled={!isSuperAdmin}
                      value={settings.referralBonusValue}
                      onChange={(e) =>
                        setSettings({ ...settings, referralBonusValue: Number(e.target.value) })
                      }
                      className="w-full bg-[#0f1422] border border-[#1a233b] rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Financial Limits */}
          <div className="bg-[#0f1422] border border-[#1a233b] rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-extrabold text-white">Financial Limits</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-[#0a0e18] p-4 rounded-xl border border-[#1a233b] flex flex-col gap-3">
                <span className="text-xs font-bold text-emerald-400 uppercase">Deposits</span>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Min (ETB)</label>
                  <input
                    type="number"
                    min={1}
                    disabled={!isSuperAdmin}
                    value={settings.minDeposit}
                    onChange={(e) => setSettings({ ...settings, minDeposit: Number(e.target.value) })}
                    className="w-full bg-[#0f1422] border border-[#1a233b] rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Max (ETB)</label>
                  <input
                    type="number"
                    min={1}
                    disabled={!isSuperAdmin}
                    value={settings.maxDeposit}
                    onChange={(e) => setSettings({ ...settings, maxDeposit: Number(e.target.value) })}
                    className="w-full bg-[#0f1422] border border-[#1a233b] rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="bg-[#0a0e18] p-4 rounded-xl border border-[#1a233b] flex flex-col gap-3">
                <span className="text-xs font-bold text-amber-400 uppercase">Withdrawals</span>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Min (ETB)</label>
                  <input
                    type="number"
                    min={1}
                    disabled={!isSuperAdmin}
                    value={settings.minWithdraw}
                    onChange={(e) => setSettings({ ...settings, minWithdraw: Number(e.target.value) })}
                    className="w-full bg-[#0f1422] border border-[#1a233b] rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Max (ETB)</label>
                  <input
                    type="number"
                    min={1}
                    disabled={!isSuperAdmin}
                    value={settings.maxWithdraw}
                    onChange={(e) => setSettings({ ...settings, maxWithdraw: Number(e.target.value) })}
                    className="w-full bg-[#0f1422] border border-[#1a233b] rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="bg-[#0a0e18] p-4 rounded-xl border border-[#1a233b] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-400 uppercase">Player Transfer</span>
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={settings.transferEnabled}
                    onChange={(e) =>
                      setSettings({ ...settings, transferEnabled: e.target.checked })
                    }
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Min (ETB)</label>
                  <input
                    type="number"
                    min={1}
                    disabled={!isSuperAdmin}
                    value={settings.minTransfer}
                    onChange={(e) => setSettings({ ...settings, minTransfer: Number(e.target.value) })}
                    className="w-full bg-[#0f1422] border border-[#1a233b] rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Max (ETB)</label>
                  <input
                    type="number"
                    min={1}
                    disabled={!isSuperAdmin}
                    value={settings.maxTransfer}
                    onChange={(e) => setSettings({ ...settings, maxTransfer: Number(e.target.value) })}
                    className="w-full bg-[#0f1422] border border-[#1a233b] rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Branding */}
          <div className="bg-[#0f1422] border border-[#1a233b] rounded-2xl p-6 shadow-xl flex flex-col gap-4">
            <h3 className="text-sm font-extrabold text-white">Bot Branding &amp; Banner</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Bot Name</label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={settings.botName}
                  onChange={(e) => setSettings({ ...settings, botName: e.target.value })}
                  className="w-full bg-[#0a0e18] border border-[#1a233b] rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Support Username</label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={settings.supportUsername || ""}
                  onChange={(e) => setSettings({ ...settings, supportUsername: e.target.value })}
                  className="w-full bg-[#0a0e18] border border-[#1a233b] rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-gray-300 block mb-1">
                  Welcome Banner HTTPS Image URL
                </label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  placeholder="https://..."
                  value={settings.welcomeBannerUrl || ""}
                  onChange={(e) => setSettings({ ...settings, welcomeBannerUrl: e.target.value })}
                  className="w-full bg-[#0a0e18] border border-[#1a233b] rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
