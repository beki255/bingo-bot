import React, { useState } from "react";
import {
  ArrowLeft,
  CreditCard,
  Play,
  Trophy,
  Ban,
  Clock,
  Target,
  Check,
  CheckCircle2,
  Navigation,
  Zap,
  Grid,
  Sparkles,
  ArrowRight,
  ArrowDown,
  ArrowDownRight,
  Maximize2,
  Users,
  AlertTriangle,
  DollarSign,
} from "lucide-react";

interface RulesScreenProps {
  onBack: () => void;
  initialLang?: "AM" | "EN";
}

type TabType = "card" | "game" | "winner" | "penalty";

export const RulesScreen: React.FC<RulesScreenProps> = ({ onBack, initialLang = "AM" }) => {
  const [lang, setLang] = useState<"AM" | "EN">(initialLang);
  const [activeTab, setActiveTab] = useState<TabType>("card");

  const tabs: { id: TabType; title: string; icon: React.ElementType }[] = [
    { id: "card", title: lang === "AM" ? "መጫወቻ ካርድ" : "Card", icon: CreditCard },
    { id: "game", title: lang === "AM" ? "ጨዋታ" : "Play", icon: Play },
    { id: "winner", title: lang === "AM" ? "አሸናፊ" : "Win", icon: Trophy },
    { id: "penalty", title: lang === "AM" ? "ቅጣት" : "Penalty", icon: Ban },
  ];

  const getStepInfo = () => {
    switch (activeTab) {
      case "card":
        return { step: "1 of 4", label: lang === "AM" ? "መጫወቻ ካርድ" : "Card Selection", progress: "25%" };
      case "game":
        return { step: "2 of 4", label: lang === "AM" ? "ጨዋታ" : "Gameplay", progress: "50%" };
      case "winner":
        return { step: "3 of 4", label: lang === "AM" ? "አሸናፊ" : "Winning Rules", progress: "75%" };
      case "penalty":
        return { step: "4 of 4", label: lang === "AM" ? "ቅጣት" : "Penalties", progress: "100%" };
    }
  };

  const { step, label, progress } = getStepInfo();

  return (
    <div className="w-full flex flex-col animate-fadeIn text-white pb-24">
      {/* 1. Top Header: Back Button, Title, and Language Switcher */}
      <div className="flex items-center justify-between mb-4 pt-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-bold text-white transition shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <h1 className="text-base sm:text-lg font-black text-amber-400 tracking-wide text-center truncate mx-2">
          {lang === "AM" ? "የቢንጎ ጨዋታ ህጎች" : "Bingo Game Rules"}
        </h1>

        {/* Language Switcher Pill */}
        <div className="flex items-center bg-[#14162e] p-0.5 rounded-xl border border-white/10 text-xs font-bold shrink-0">
          <button
            onClick={() => setLang("AM")}
            className={`px-2 py-1 rounded-lg transition ${
              lang === "AM"
                ? "bg-amber-400 text-black shadow-sm font-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            አማ
          </button>
          <button
            onClick={() => setLang("EN")}
            className={`px-2 py-1 rounded-lg transition ${
              lang === "EN"
                ? "bg-amber-400 text-black shadow-sm font-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            EN
          </button>
        </div>
      </div>

      {/* 2. Horizontal 4-Tab Segmented Switcher */}
      <div className="grid grid-cols-4 gap-1.5 bg-[#121327] p-1.5 rounded-2xl border border-white/5 mb-4 shadow-lg">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-[#252a52] text-amber-300 shadow-md border border-white/10"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Icon
                className={`w-4 h-4 mb-1 ${
                  isActive ? "text-amber-400 scale-110" : "text-gray-400"
                }`}
              />
              <span
                className={`text-[11px] font-bold tracking-tight text-center truncate w-full ${
                  isActive ? "text-amber-300" : "text-gray-400"
                }`}
              >
                {tab.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Progress Row: 'X of 4' & Pill Badge */}
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-xs font-bold text-gray-400">{step}</span>
        <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-purple-900/40 border border-purple-500/30 text-purple-300">
          {label}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-[#1b1f3d] rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300 rounded-full"
          style={{ width: progress }}
        />
      </div>

      {/* 4. Tab 1 Content: መጫወቻ ካርድ (Card Selection) */}
      {activeTab === "card" && (
        <div className="flex flex-col animate-fadeIn">
          {/* Big Center Icon & Title */}
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-950/40 mb-3">
              <CreditCard className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-wide">
              {lang === "AM" ? "መጫወቻ ካርድ" : "Card Selection"}
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            {/* 1. Choose Your Card */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm">
                  1
                </div>
                <h3 className="text-sm font-bold text-white">Choose Your Card</h3>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed pl-10 font-medium">
                {lang === "AM"
                  ? "ጨዋታውን ለመጀመር ከሚመጣልን ከ1-600 የመጫወቻ ካርድ ውስጥ አንዱን እንመርጣለን"
                  : "Choose your desired playing card from 1 to 600 available board cards to begin."}
              </p>
            </div>

            {/* 2. Card Status Indicator */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm">
                  2
                </div>
                <h3 className="text-sm font-bold text-white">Card Status Indicator</h3>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed pl-10 font-medium">
                {lang === "AM"
                  ? "የመጫወቻ ካርዱ ላይ በቀይ ቀለም የተመረጡ ቁጥሮች የሚያሳዩት መጫወቻ ካርድ በሌላ ተጫዋች መመረጡን ነው።"
                  : "Numbers highlighted in orange/red show cards that have already been chosen by other players."}
              </p>
            </div>

            {/* 3. Card Preview */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm">
                  3
                </div>
                <h3 className="text-sm font-bold text-white">Card Preview</h3>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed pl-10 font-medium">
                {lang === "AM"
                  ? "የመጫወቻ ካርድ ስንነካው ከታች በኩል ካርድ ቁጥሩ የሚይዘውን መጫወቻ ካርድ ያሳየናል"
                  : "Tapping any available card opens a 5x5 preview drawer showing its exact layout before confirming."}
              </p>
            </div>

            {/* 4. Card Selection Tips */}
            <div className="bg-gradient-to-br from-[#1b1c3a] to-[#14162e] border border-amber-500/30 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-amber-400">Card Selection Tips</h3>
              </div>
              <div className="space-y-2 text-xs text-gray-200">
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    {lang === "AM"
                      ? "በቀይ ያልተመረጡ ነፃ ካርዶችን ይምረጡ"
                      : "Choose cards that are not marked in red"}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    {lang === "AM"
                      ? "ከማረጋገጥዎ በፊት ካርቴላውን አስቀድመው ይመልከቱ"
                      : "Preview your card before confirming"}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    {lang === "AM"
                      ? "የምዝገባ ጊዜው ከማለቁ በፊት በፍጥነት ይምረጡ"
                      : "Select quickly before registration time ends"}
                  </span>
                </div>
              </div>
            </div>

            {/* 5. Registration Timer */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-blue-300">Registration Timer</h3>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed pl-9 font-medium">
                {lang === "AM"
                  ? "ወደ ጨዋታው ለመግባት የምንፈልገውን ካርድ ከመርጠን ለምዝገባ የተሰጠው ሰከንድ ዜሮ ሲሆን ቀጥታ ወደ ጨዋታ ያስገባናል"
                  : "Once minimum 3 players join, the 45-second timer counts down to 0 and launches the game."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab 2 Content: ጨዋታ (Gameplay) */}
      {activeTab === "game" && (
        <div className="flex flex-col animate-fadeIn">
          {/* Big Center Icon & Title */}
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-blue-500/20 border-2 border-blue-500/40 flex items-center justify-center shadow-lg shadow-blue-950/40 mb-3">
              <Play className="w-8 h-8 text-blue-400 fill-blue-400" />
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-wide">
              {lang === "AM" ? "ጨዋታ" : "Gameplay"}
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            {/* 1. Game Entry */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm">
                  1
                </div>
                <h3 className="text-sm font-bold text-white">Game Entry</h3>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed pl-10 font-medium">
                {lang === "AM"
                  ? "ወደ ጨዋታው ስንገባ በመረጥነው የካርድ ቁጥር መሰረት የመጫወቻ ካርድ እናገኛለን"
                  : "When entering the round, you play with the exact Cartela numbers you selected."}
              </p>
            </div>

            {/* 2. Game Timer */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm">
                  2
                </div>
                <h3 className="text-sm font-bold text-white">Game Timer</h3>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed pl-10 font-medium">
                {lang === "AM"
                  ? "ከላይ በቀኝ በኩል ጨዋታው ለመጀመር ያለውን ቀሪ ሰከንድ መቁጠር ይጀምራል"
                  : "The round begins calling balls every 3 seconds with dynamic glow and audio."}
              </p>
            </div>

            {/* 3. Number Calling */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm">
                  3
                </div>
                <h3 className="text-sm font-bold text-white">Number Calling</h3>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed pl-10 font-medium">
                {lang === "AM"
                  ? "ጨዋታው ሲጀመር የተለያዩ ቁጥሮች ከ1 እስከ 75 መጥራት ይጀምራል"
                  : "Bingo balls from 1 to 75 are randomly called and highlighted on the 75-ball board."}
              </p>
            </div>

            {/* 4. Marking Numbers */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0">
                  <Navigation className="w-4 h-4 rotate-45" />
                </div>
                <h3 className="text-sm font-bold text-white">Marking Numbers</h3>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed pl-10 font-medium">
                {lang === "AM"
                  ? "የሚጠራው ቁጥር የእኛ መጫወቻ ካርድ ውስጥ ካለ የተጠራውን ቁጥር ክሊክ በማድረግ መምረጥ እንችላለን"
                  : "If a called ball appears on your cartela, click the cell to mark it (or turn on Automatic)."}
              </p>
            </div>

            {/* 5. Unmarking Numbers */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Unmarking Numbers</h3>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed pl-10 font-medium">
                {lang === "AM"
                  ? "የመረጥነውን ቁጥር ማጥፋት ከፈለግን መልሰን እራሱን ቁጥር ክሊክ በማድረግ ማጥፋት እንችላለን"
                  : "In manual mode, tapping an already marked cell toggles it back off."}
              </p>
            </div>

            {/* 6. Game Mechanics Box */}
            <div className="bg-gradient-to-br from-[#122238] to-[#10192e] border border-cyan-500/30 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <Grid className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-cyan-400">Game Mechanics</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="font-bold text-white block">Number Range</span>
                  <span className="text-[11px] text-gray-300">
                    Numbers called are from 1 to 75
                  </span>
                </div>
                <div>
                  <span className="font-bold text-white block">Card Layout</span>
                  <span className="text-[11px] text-gray-300">
                    5×5 grid with center FREE space
                  </span>
                </div>
                <div>
                  <span className="font-bold text-white block">Marking</span>
                  <span className="text-[11px] text-gray-300">
                    Click to mark/unmark numbers
                  </span>
                </div>
                <div>
                  <span className="font-bold text-white block">Timer</span>
                  <span className="text-[11px] text-gray-300">
                    Countdown shows game start time
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Tab 3 Content: አሸናፊ (Winner Rules) */}
      {activeTab === "winner" && (
        <div className="flex flex-col animate-fadeIn">
          {/* Big Center Icon & Title */}
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-950/40 mb-3">
              <Trophy className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-wide">
              {lang === "AM" ? "አሸናፊ" : "Winning Rules"}
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            {/* Main Winning Rule */}
            <div className="bg-gradient-to-br from-[#241c2c] to-[#17142b] border border-amber-500/40 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-amber-400">Main Winning Rule</h3>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
                {lang === "AM"
                  ? "ቁጥሮቹ ሲጠሩ ከመጫወቻ ካርዳችን ላይ እየመረጥን ወደጎን ወይም ወደታች ወይም ወደሁለቱም አግዳሚ ወይም አራቱን ማእዘናት ከመረጥን ወዲያውኑ ከታች በኩል bingo የሚለውን በመንካት ማሸነፍ እንችላለን"
                  : "As balls are called, complete any valid pattern (horizontal, vertical, diagonal, or 4 corners) and hit BINGO to win!"}
              </p>
            </div>

            {/* Pattern 1: ወደጎን */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-md">
                <ArrowRight className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-400 mb-0.5">
                  {lang === "AM" ? "ወደጎን" : "Horizontal Line"}
                </h3>
                <p className="text-xs text-gray-300 font-medium">
                  {lang === "AM"
                    ? "ማንኛውንም አግድም ረድፍ ማጠናቀቅ (5 ቁጥሮች በመስመር)"
                    : "Complete any horizontal row (5 numbers in a line)"}
                </p>
              </div>
            </div>

            {/* Pattern 2: ወደታች */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-md">
                <ArrowDown className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-400 mb-0.5">
                  {lang === "AM" ? "ወደታች" : "Vertical Column"}
                </h3>
                <p className="text-xs text-gray-300 font-medium">
                  {lang === "AM"
                    ? "ማንኛውንም ቀጥ ያለ አምድ ማጠናቀቅ (5 ቁጥሮች በመስመር)"
                    : "Complete any vertical column (5 numbers in a column)"}
                </p>
              </div>
            </div>

            {/* Pattern 3: አግዳሚ */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-md">
                <ArrowDownRight className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-400 mb-0.5">
                  {lang === "AM" ? "አግዳሚ" : "Diagonal Line"}
                </h3>
                <p className="text-xs text-gray-300 font-medium">
                  {lang === "AM"
                    ? "ማንኛውንም አግዳሚ መስመር ማጠናቀቅ (5 ቁጥሮች በአግዳሚ)"
                    : "Complete any diagonal line from corner to corner (5 numbers)"}
                </p>
              </div>
            </div>

            {/* Pattern 4: አራቱን ማእዘናት */}
            <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-md">
                <Maximize2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-400 mb-0.5">
                  {lang === "AM" ? "አራቱን ማእዘናት" : "Four Corners"}
                </h3>
                <p className="text-xs text-gray-300 font-medium">
                  {lang === "AM"
                    ? "የካርዱን አራቱን ማእዘን ቁጥሮች ማመልከት"
                    : "Mark all 4 corner positions of your 5x5 card"}
                </p>
              </div>
            </div>

            {/* Multiple Winners */}
            <div className="bg-gradient-to-br from-[#12282e] to-[#101b24] border border-teal-500/30 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-teal-400" />
                <h3 className="text-sm font-bold text-teal-400">Multiple Winners</h3>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
                {lang === "AM"
                  ? "ሁለት ወይም ከዚያ በላይ ተጫዋቾች እኩል ቢያሸንፉ ደራሹ ለ ቁጥራቸው ይካፈላል።"
                  : "If two or more players win simultaneously, the prize pool is evenly split."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 7. Tab 4 Content: ቅጣት (Penalty) */}
      {activeTab === "penalty" && (
        <div className="flex flex-col animate-fadeIn">
          {/* Big Center Icon & Title */}
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center shadow-lg shadow-red-950/40 mb-3">
              <Ban className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-wide">
              {lang === "AM" ? "ቅጣት" : "Penalties"}
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            {/* 1. False BINGO Penalty */}
            <div className="bg-gradient-to-br from-[#2e151a] to-[#1c0f13] border border-red-500/40 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <h3 className="text-sm font-bold text-red-400">False BINGO Penalty</h3>
              </div>
              <h4 className="text-xs font-bold text-white mb-1.5">Rule Violation</h4>
              <p className="text-xs text-amber-200/90 leading-relaxed font-medium mb-3">
                {lang === "AM"
                  ? "ወደጎን ወይም ወደታች ወይም ወደሁለቱም አግዳሚ ወይም አራቱን ማእዘናት ሳይሞሉ bingo የሚለውን ክሊክ ካደረግን ከጨዋታው እንታገዳለን"
                  : "Calling BINGO without a fully completed winning pattern triggers an immediate false claim penalty."}
              </p>

              {/* Consequences Sub-box */}
              <div className="bg-black/35 border border-red-500/20 rounded-xl p-3.5 space-y-2.5">
                <span className="text-xs font-bold text-red-400 block mb-1">
                  Consequences:
                </span>
                <div className="flex items-center gap-2 text-xs text-gray-200">
                  <Ban className="w-4 h-4 text-red-400 shrink-0" />
                  <span>
                    {lang === "AM"
                      ? "ወዲያውኑ ከጨዋታው መወገድ (Immediate removal)"
                      : "Immediate removal from current game"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-200">
                  <DollarSign className="w-4 h-4 text-red-400 shrink-0" />
                  <span>
                    {lang === "AM"
                      ? "የመግቢያ ክፍያ / መደብ ማጣት (Loss of stake)"
                      : "Loss of entry fee/stake"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-200">
                  <Clock className="w-4 h-4 text-red-400 shrink-0" />
                  <span>
                    {lang === "AM"
                      ? "ለተወሰነ ጊዜ ከአዳዲስ ጨዋታዎች መታገድ (Temporary ban)"
                      : "Temporary ban from joining new games"}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Valid BINGO Conditions */}
            <div className="bg-[#14162e] border border-amber-500/30 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-2 mb-2.5">
                <CheckCircle2 className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-amber-400">
                  {lang === "AM" ? "ትክክለኛ የማሸነፊያ መስፈርቶች" : "Valid BINGO Conditions"}
                </h3>
              </div>
              <ul className="space-y-1.5 text-xs text-gray-200 pl-2">
                <li>
                  {lang === "AM"
                    ? "• ማንኛውም አግድም መስመር ማጠናቀቅ (5 ቁጥሮች)"
                    : "• Complete horizontal line (5 numbers)"}
                </li>
                <li>
                  {lang === "AM"
                    ? "• ማንኛውም ቀጥ ያለ አምድ ማጠናቀቅ (5 ቁጥሮች)"
                    : "• Complete vertical line (5 numbers)"}
                </li>
                <li>
                  {lang === "AM"
                    ? "• ማንኛውም ሰያፍ መስመር ማጠናቀቅ (5 ቁጥሮች)"
                    : "• Complete diagonal line (5 numbers)"}
                </li>
                <li>
                  {lang === "AM"
                    ? "• አራቱንም ማዕዘናት ማመልከት"
                    : "• All four corners marked"}
                </li>
              </ul>
            </div>

            {/* 3. Invalid BINGO Attempts */}
            <div className="bg-[#14162e] border border-red-500/30 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-2 mb-2.5">
                <Ban className="w-5 h-5 text-red-400" />
                <h3 className="text-sm font-bold text-red-400">
                  {lang === "AM" ? "ልክ ያልሆኑ የቢንጎ ሙከራዎች" : "Invalid BINGO Attempts"}
                </h3>
              </div>
              <ul className="space-y-1.5 text-xs text-gray-200 pl-2">
                <li>
                  {lang === "AM"
                    ? "• ያልተሟሉ መስመሮች ወይም ቅርጾች"
                    : "• Incomplete lines or patterns"}
                </li>
                <li>
                  {lang === "AM"
                    ? "• በዘፈቀደ ምልክት የተደረጉ ቁጥሮች"
                    : "• Random marked numbers"}
                </li>
                <li>
                  {lang === "AM"
                    ? "• ጊዜው ሳይደርስ የሚጠራ ቢንጎ"
                    : "• Premature BINGO calls"}
                </li>
                <li>
                  {lang === "AM"
                    ? "• የሐሰት ቅርጽ አሸናፊነት ጥሪ"
                    : "• False pattern claims"}
                </li>
              </ul>
            </div>

            {/* 4. Pro Tips to Avoid Penalties */}
            <div className="bg-gradient-to-br from-[#121c38] to-[#10142b] border border-cyan-500/30 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-2 mb-2.5">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-cyan-400">
                  {lang === "AM" ? "ቅጣትን ለማስወገድ ምርጥ ምክሮች" : "Pro Tips to Avoid Penalties"}
                </h3>
              </div>
              <ul className="space-y-2 text-xs text-gray-200 pl-2">
                <li>
                  {lang === "AM"
                    ? "• BINGO ከመጫንዎ በፊት መስመሮቹን በድጋሚ ያረጋግጡ"
                    : "• Double-check your pattern before clicking BINGO"}
                </li>
                <li>
                  {lang === "AM"
                    ? "• በመስመሩ ላይ በትክክል 5 ቁጥሮች መኖራቸውን እርግጠኛ ይሁኑ"
                    : "• Make sure you have exactly 5 numbers in a line"}
                </li>
                <li>
                  {lang === "AM"
                    ? "• ለማዕዘን ድል አራቱም ማዕዘኖች መመረጣቸውን ያረጋግጡ"
                    : "• Verify all four corners are marked for corner wins"}
                </li>
                <li>
                  {lang === "AM"
                    ? "• አይጣደፉ - BINGO ለመጥራት መቸኮል አያስፈልግም"
                    : "• Take your time - there's no rush to call BINGO"}
                </li>
                <li>
                  {lang === "AM"
                    ? "• ጥርጣሬ ካለዎት ተጨማሪ ቁጥሮች እስኪጠሩ ይጠብቁ"
                    : "• If unsure, wait for more numbers to be called"}
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 8. Centered Bot Watermark */}
      <div className="mt-8 text-center">
        <span className="text-xs text-gray-500 font-medium tracking-wider">
          @tunnel_bingo_bot
        </span>
      </div>
    </div>
  );
};
