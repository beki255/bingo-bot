import React, { useState } from "react";
import { X, HelpCircle, CheckCircle2 } from "lucide-react";

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  const [lang, setLang] = useState<"AM" | "EN">("AM");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md max-h-[85vh] bg-[#14162e] border border-amber-400/40 rounded-2xl p-5 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white">
              {lang === "AM" ? "የቢንጎ ጨዋታ መመሪያ" : "Bingo Game Rules"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Language switcher */}
        <div className="flex gap-2 my-3">
          <button
            onClick={() => setLang("AM")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
              lang === "AM"
                ? "bg-amber-400 text-black shadow-md shadow-amber-400/20"
                : "bg-white/5 text-gray-400 hover:bg-white/10"
            }`}
          >
            🇪🇹 አማርኛ
          </button>
          <button
            onClick={() => setLang("EN")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
              lang === "EN"
                ? "bg-amber-400 text-black shadow-md shadow-amber-400/20"
                : "bg-white/5 text-gray-400 hover:bg-white/10"
            }`}
          >
            🇬🇧 English
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-1 text-sm text-gray-300 space-y-4">
          {lang === "AM" ? (
            <>
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <h3 className="font-bold text-amber-300 mb-1.5">🃏 የካርቴላ መምረጫ</h3>
                <ul className="text-xs space-y-1.5 text-gray-300">
                  <li>• ከ1 እስከ 600 ካሉት ቁጥሮች ውስጥ በአንድ ዙር እስከ 2 ካርቴላ መምረጥ ይችላሉ።</li>
                  <li>• በቀይ ቀለም የበሩ ቁጥሮች በሌላ ተጫዋች የተያዙ ናቸው።</li>
                  <li>• ነፃ ቁጥር ሲነኩ ካርቴላው የያዛቸውን ቁጥሮች አስቀድመው ማየት ይችላሉ።</li>
                </ul>
              </div>

              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <h3 className="font-bold text-cyan-300 mb-1.5">🎮 የጨዋታው ሂደት</h3>
                <ul className="text-xs space-y-1.5 text-gray-300">
                  <li>• ሲስተሙ ከ1 እስከ 75 ያሉትን ቁጥሮች በዘፈቀደ (Randomly) ይጠራል።</li>
                  <li>• የተጠራው ቁጥር በእርስዎ ካርቴላ ላይ ሲኖር ምልክት ያድርጉ (Automatic ሁነታንም ማብራት ይቻላል)።</li>
                </ul>
              </div>

              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <h3 className="font-bold text-emerald-300 mb-1.5">🏆 የማሸነፊያ መንገዶች</h3>
                <ul className="text-xs space-y-1.5 text-gray-300">
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>ወደ ጎን (አግድም) ወይም ወደ ታች (ቁልቁል) ሙሉ መስመር</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>በሁለቱም አቅጣጫ ሰያፍ (Diagonal) መስመር</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>የካርቴላውን አራቱንም ማዕዘናት (4 Corners)</span>
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <h3 className="font-bold text-amber-300 mb-1.5">🃏 Cartela Selection</h3>
                <ul className="text-xs space-y-1.5 text-gray-300">
                  <li>• Choose up to 2 cartelas from the 1–600 board before the round starts.</li>
                  <li>• Numbers highlighted in red are already taken by other players.</li>
                  <li>• Tap any available number to preview its numbers.</li>
                </ul>
              </div>

              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <h3 className="font-bold text-cyan-300 mb-1.5">🎮 How to Play</h3>
                <ul className="text-xs space-y-1.5 text-gray-300">
                  <li>• System draws balls 1 to 75 randomly.</li>
                  <li>• Mark numbers on your cartela manually, or turn on Automatic marking.</li>
                </ul>
              </div>

              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <h3 className="font-bold text-emerald-300 mb-1.5">🏆 Winning Patterns</h3>
                <ul className="text-xs space-y-1.5 text-gray-300">
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>Full Horizontal or Vertical Line</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>Either Diagonal Line</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>All Four Corners</span>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-sm shadow-lg hover:brightness-110 active:scale-[0.98] transition"
        >
          {lang === "AM" ? "ተረድቻለሁ (Close)" : "Got it!"}
        </button>
      </div>
    </div>
  );
};
