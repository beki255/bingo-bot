import React, { useId, useState } from "react";
import { formatMoney } from "../api";
import type { HourlyActivityPoint } from "../types";

function compactNumber(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return String(Math.round(val));
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
}

export interface MultiSeriesConfig<T> {
  key: keyof T;
  label: string;
  color: string;
  format?: (v: number) => string;
}

interface MultiAreaTrendChartProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: keyof T;
  series: Array<MultiSeriesConfig<T>>;
  formatY?: (v: number) => string;
}

export function MultiAreaTrendChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  formatY = compactNumber,
}: MultiAreaTrendChartProps<T>) {
  const uid = useId().replace(/:/g, "");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 760;
  const H = 265;
  const padL = 56;
  const padR = 18;
  const padT = 18;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (!data || data.length === 0) {
    return (
      <div className="h-60 flex items-center justify-center text-xs text-slate-400 dark:text-gray-500">
        No data points available for this range.
      </div>
    );
  }

  let minVal = 0;
  let maxVal = 0;
  for (const row of data) {
    for (const s of series) {
      const v = Number(row[s.key] ?? 0);
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
  }
  if (minVal === maxVal) {
    maxVal = minVal === 0 ? 10 : minVal + Math.abs(minVal) * 0.25 + 1;
  } else {
    const span = maxVal - minVal;
    maxVal += span * 0.1;
    if (minVal < 0) minVal -= span * 0.08;
  }
  const rangeSpan = maxVal - minVal || 1;

  const getX = (idx: number) =>
    data.length === 1 ? padL + plotW / 2 : padL + (idx / (data.length - 1)) * plotW;
  const getY = (val: number) => padT + ((maxVal - val) / rangeSpan) * plotH;

  const zeroY = Math.min(padT + plotH, Math.max(padT, getY(0)));
  const gridSteps = 4;
  const gridTicks = Array.from({ length: gridSteps + 1 }, (_, i) => {
    const val = minVal + (rangeSpan * i) / gridSteps;
    return { val, y: getY(val) };
  });

  const labelStep = Math.max(1, Math.ceil(data.length / 7));

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    if (data.length === 1) {
      setHoverIdx(0);
      return;
    }
    const clamped = Math.max(padL, Math.min(W - padR, relX));
    const idx = Math.round(((clamped - padL) / plotW) * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  };

  const hoveredRow = hoverIdx !== null ? data[hoverIdx] : null;
  const hoveredX = hoverIdx !== null ? getX(hoverIdx) : 0;
  const tooltipLeftPct = hoverIdx !== null ? (hoveredX / W) * 100 : 0;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block select-none overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={String(s.key)} id={`grad-${uid}-${String(s.key)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
            </linearGradient>
          ))}
        </defs>

        {/* Horizontal Gridlines & Y Labels */}
        {gridTicks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={padL}
              y1={t.y}
              x2={W - padR}
              y2={t.y}
              stroke="currentColor"
              strokeDasharray="4 4"
              className="text-slate-200 dark:text-[#1e2742]"
            />
            <text
              x={padL - 8}
              y={t.y + 3.5}
              textAnchor="end"
              fill="currentColor"
              className="text-[10px] font-medium text-slate-400 dark:text-gray-500"
            >
              {formatY(t.val)}
            </text>
          </g>
        ))}

        {/* Zero baseline when negative values exist */}
        {minVal < 0 && (
          <line
            x1={padL}
            y1={zeroY}
            x2={W - padR}
            y2={zeroY}
            stroke="currentColor"
            strokeWidth="1.2"
            className="text-slate-300 dark:text-[#2a3659]"
          />
        )}

        {/* X Axis Labels */}
        {data.map((row, idx) => {
          const isLast = idx === data.length - 1;
          if (idx % labelStep !== 0 && !isLast) return null;
          if (isLast && idx % labelStep !== 0 && data.length - 1 - Math.floor((data.length - 1) / labelStep) * labelStep < 2) {
            return null;
          }
          return (
            <text
              key={idx}
              x={getX(idx)}
              y={H - 8}
              textAnchor="middle"
              fill="currentColor"
              className="text-[10px] font-medium text-slate-400 dark:text-gray-500"
            >
              {String(row[xKey] ?? "")}
            </text>
          );
        })}

        {/* Areas & Lines */}
        {series.map((s) => {
          const pts = data.map((row, idx) => ({
            x: getX(idx),
            y: getY(Number(row[s.key] ?? 0)),
          }));
          const linePath = buildSmoothPath(pts);
          const areaPath =
            pts.length >= 2
              ? `${linePath} L ${pts[pts.length - 1].x.toFixed(2)} ${zeroY.toFixed(2)} L ${pts[0].x.toFixed(2)} ${zeroY.toFixed(2)} Z`
              : "";

          return (
            <g key={String(s.key)}>
              {areaPath && (
                <path d={areaPath} fill={`url(#grad-${uid}-${String(s.key)})`} />
              )}
              <path
                d={linePath}
                fill="none"
                stroke={s.color}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {pts.length === 1 && (
                <circle cx={pts[0].x} cy={pts[0].y} r="4.5" fill={s.color} />
              )}
            </g>
          );
        })}

        {/* Hover Crosshair & Points */}
        {hoverIdx !== null && (
          <g>
            <line
              x1={hoveredX}
              y1={padT}
              x2={hoveredX}
              y2={padT + plotH}
              stroke="currentColor"
              strokeDasharray="3 3"
              className="text-slate-400 dark:text-gray-400"
            />
            {series.map((s) => {
              const val = Number(data[hoverIdx][s.key] ?? 0);
              const cy = getY(val);
              return (
                <g key={String(s.key)}>
                  <circle cx={hoveredX} cy={cy} r="6.5" fill={s.color} fillOpacity="0.22" />
                  <circle cx={hoveredX} cy={cy} r="3.8" fill={s.color} stroke="#ffffff" strokeWidth="1.5" />
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {/* Floating Glass Tooltip */}
      {hoveredRow && hoverIdx !== null && (
        <div
          className="pointer-events-none absolute top-2 z-20 min-w-[175px] rounded-xl bg-white/95 dark:bg-[#0b101d]/95 border border-slate-200 dark:border-[#263250] px-3 py-2.5 shadow-xl backdrop-blur-md text-xs"
          style={{
            left: tooltipLeftPct > 65 ? undefined : `calc(${Math.max(8, tooltipLeftPct)}% + 10px)`,
            right: tooltipLeftPct > 65 ? `calc(${Math.max(8, 100 - tooltipLeftPct)}% + 10px)` : undefined,
          }}
        >
          <div className="text-[11px] font-black text-slate-900 dark:text-white mb-1.5 border-b border-slate-100 dark:border-[#1a233b] pb-1">
            {String(hoveredRow[xKey] ?? "")}
          </div>
          <div className="flex flex-col gap-1">
            {series.map((s) => {
              const val = Number(hoveredRow[s.key] ?? 0);
              return (
                <div key={String(s.key)} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-gray-300">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                    {s.format ? s.format(val) : `${formatMoney(val)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export interface GroupedBarItem {
  label: string;
  primary: number;
  secondary: number;
  primaryCount?: number;
  secondaryCount?: number;
}

interface GroupedBarChartProps {
  data: GroupedBarItem[];
  primaryLabel: string;
  secondaryLabel: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export const GroupedBarChart: React.FC<GroupedBarChartProps> = ({
  data,
  primaryLabel,
  secondaryLabel,
  primaryColor = "#10b981",
  secondaryColor = "#f59e0b",
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 540;
  const H = 235;
  const padL = 50;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // For dense ranges, keep at most 18 bars grouped or display cleanly
  const displayData = data.length > 24 ? data.slice(-24) : data;
  if (displayData.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-xs text-slate-400 dark:text-gray-500">
        No cashflow records in this period.
      </div>
    );
  }

  let maxVal = 0;
  for (const d of displayData) {
    if (d.primary > maxVal) maxVal = d.primary;
    if (d.secondary > maxVal) maxVal = d.secondary;
  }
  if (maxVal <= 0) maxVal = 100;
  else maxVal *= 1.12;

  const slotW = plotW / displayData.length;
  const barW = Math.max(3, Math.min(14, slotW * 0.34));
  const gap = Math.max(1.5, Math.min(4, slotW * 0.08));
  const labelStep = Math.max(1, Math.ceil(displayData.length / 6));

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    val: maxVal * r,
    y: padT + plotH - r * plotH,
  }));

  const hovered = hoverIdx !== null ? displayData[hoverIdx] : null;
  const tooltipPct = hoverIdx !== null ? ((padL + (hoverIdx + 0.5) * slotW) / W) * 100 : 0;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block select-none"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {gridTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              y1={t.y}
              x2={W - padR}
              y2={t.y}
              stroke="currentColor"
              strokeDasharray="4 4"
              className="text-slate-200 dark:text-[#1e2742]"
            />
            <text
              x={padL - 8}
              y={t.y + 3.5}
              textAnchor="end"
              fill="currentColor"
              className="text-[10px] font-medium text-slate-400 dark:text-gray-500"
            >
              {compactNumber(t.val)}
            </text>
          </g>
        ))}

        {displayData.map((item, idx) => {
          const cx = padL + (idx + 0.5) * slotW;
          const h1 = (item.primary / maxVal) * plotH;
          const h2 = (item.secondary / maxVal) * plotH;
          const isHovered = hoverIdx === idx;
          const showLabel = idx % labelStep === 0 || idx === displayData.length - 1;

          return (
            <g key={idx} onMouseEnter={() => setHoverIdx(idx)} className="cursor-pointer">
              <rect
                x={padL + idx * slotW}
                y={padT}
                width={slotW}
                height={plotH}
                fill={isHovered ? "currentColor" : "transparent"}
                fillOpacity={isHovered ? 0.06 : 0}
                className="text-slate-500 dark:text-white"
              />
              <rect
                x={cx - barW - gap / 2}
                y={padT + plotH - h1}
                width={barW}
                height={Math.max(h1 > 0 ? 2 : 0, h1)}
                rx={Math.min(3, barW / 2)}
                fill={primaryColor}
                fillOpacity={hoverIdx !== null && !isHovered ? 0.45 : 0.95}
              />
              <rect
                x={cx + gap / 2}
                y={padT + plotH - h2}
                width={barW}
                height={Math.max(h2 > 0 ? 2 : 0, h2)}
                rx={Math.min(3, barW / 2)}
                fill={secondaryColor}
                fillOpacity={hoverIdx !== null && !isHovered ? 0.45 : 0.95}
              />
              {showLabel && (
                <text
                  x={cx}
                  y={H - 8}
                  textAnchor="middle"
                  fill="currentColor"
                  className="text-[9.5px] font-medium text-slate-400 dark:text-gray-500"
                >
                  {item.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 z-20 min-w-[175px] rounded-xl bg-white/95 dark:bg-[#0b101d]/95 border border-slate-200 dark:border-[#263250] px-3 py-2 shadow-xl backdrop-blur-md text-xs"
          style={{
            left: tooltipPct > 60 ? undefined : `calc(${Math.max(6, tooltipPct)}% + 6px)`,
            right: tooltipPct > 60 ? `calc(${Math.max(6, 100 - tooltipPct)}% + 6px)` : undefined,
          }}
        >
          <div className="text-[11px] font-black text-slate-900 dark:text-white mb-1 border-b border-slate-100 dark:border-[#1a233b] pb-1">
            {hovered.label}
          </div>
          <div className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-gray-300">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: primaryColor }} />
              {primaryLabel}
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {formatMoney(hovered.primary)} ETB
              {hovered.primaryCount !== undefined ? ` (${hovered.primaryCount})` : ""}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-gray-300">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: secondaryColor }} />
              {secondaryLabel}
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {formatMoney(hovered.secondary)} ETB
              {hovered.secondaryCount !== undefined ? ` (${hovered.secondaryCount})` : ""}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1 mt-1 border-t border-slate-100 dark:border-[#1a233b]">
            <span className="text-[11px] font-bold text-slate-500 dark:text-gray-400">Net</span>
            <span
              className={`font-black ${
                hovered.primary - hovered.secondary >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {hovered.primary - hovered.secondary >= 0 ? "+" : ""}
              {formatMoney(hovered.primary - hovered.secondary)} ETB
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

interface HourlyActivityChartProps {
  data: HourlyActivityPoint[];
  metric: "tickets" | "deposits" | "rounds";
}

export const HourlyActivityChart: React.FC<HourlyActivityChartProps> = ({ data, metric }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 540;
  const H = 235;
  const padL = 44;
  const padR = 12;
  const padT = 16;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const values = data.map((d) =>
    metric === "tickets" ? d.tickets : metric === "deposits" ? d.depositsAmount : d.rounds
  );
  const maxVal = Math.max(1, ...values) * 1.12;
  const peakIdx = values.reduce((best, val, idx) => (val > values[best] ? idx : best), 0);
  const slotW = plotW / 24;
  const barW = Math.max(6, slotW * 0.65);

  const barColor =
    metric === "tickets" ? "#06b6d4" : metric === "deposits" ? "#10b981" : "#8b5cf6";

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    val: maxVal * r,
    y: padT + plotH - r * plotH,
  }));

  const hovered = hoverIdx !== null ? data[hoverIdx] : null;
  const tooltipPct = hoverIdx !== null ? ((padL + (hoverIdx + 0.5) * slotW) / W) * 100 : 0;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block select-none"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {gridTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              y1={t.y}
              x2={W - padR}
              y2={t.y}
              stroke="currentColor"
              strokeDasharray="4 4"
              className="text-slate-200 dark:text-[#1e2742]"
            />
            <text
              x={padL - 7}
              y={t.y + 3.5}
              textAnchor="end"
              fill="currentColor"
              className="text-[10px] font-medium text-slate-400 dark:text-gray-500"
            >
              {compactNumber(t.val)}
            </text>
          </g>
        ))}

        {data.map((item, idx) => {
          const val = values[idx];
          const h = (val / maxVal) * plotH;
          const cx = padL + (idx + 0.5) * slotW;
          const isPeak = idx === peakIdx && val > 0;
          const isHovered = hoverIdx === idx;
          const opacity =
            hoverIdx !== null
              ? isHovered
                ? 1
                : 0.38
              : isPeak
              ? 1
              : 0.35 + (val / maxVal) * 0.55;

          return (
            <g key={item.hour} onMouseEnter={() => setHoverIdx(idx)} className="cursor-pointer">
              <rect
                x={padL + idx * slotW}
                y={padT}
                width={slotW}
                height={plotH}
                fill="transparent"
              />
              <rect
                x={cx - barW / 2}
                y={padT + plotH - h}
                width={barW}
                height={Math.max(val > 0 ? 2 : 0, h)}
                rx={3}
                fill={isPeak ? "#f59e0b" : barColor}
                fillOpacity={opacity}
              />
              {item.hour % 3 === 0 && (
                <text
                  x={cx}
                  y={H - 8}
                  textAnchor="middle"
                  fill="currentColor"
                  className="text-[9.5px] font-medium text-slate-400 dark:text-gray-500"
                >
                  {String(item.hour).padStart(2, "0")}h
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 z-20 min-w-[175px] rounded-xl bg-white/95 dark:bg-[#0b101d]/95 border border-slate-200 dark:border-[#263250] px-3 py-2 shadow-xl backdrop-blur-md text-xs"
          style={{
            left: tooltipPct > 60 ? undefined : `calc(${Math.max(6, tooltipPct)}% + 6px)`,
            right: tooltipPct > 60 ? `calc(${Math.max(6, 100 - tooltipPct)}% + 6px)` : undefined,
          }}
        >
          <div className="text-[11px] font-black text-slate-900 dark:text-white mb-1 border-b border-slate-100 dark:border-[#1a233b] pb-1">
            {hovered.label} EAT
          </div>
          <div className="flex justify-between gap-4 py-0.5 text-[11px]">
            <span className="text-slate-500 dark:text-gray-400">Tickets</span>
            <span className="font-bold text-slate-900 dark:text-white">{hovered.tickets}</span>
          </div>
          <div className="flex justify-between gap-4 py-0.5 text-[11px]">
            <span className="text-slate-500 dark:text-gray-400">Rounds</span>
            <span className="font-bold text-slate-900 dark:text-white">{hovered.rounds}</span>
          </div>
          <div className="flex justify-between gap-4 py-0.5 text-[11px]">
            <span className="text-slate-500 dark:text-gray-400">Deposits</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {formatMoney(hovered.depositsAmount)} ETB
            </span>
          </div>
          <div className="flex justify-between gap-4 py-0.5 text-[11px]">
            <span className="text-slate-500 dark:text-gray-400">Withdrawals</span>
            <span className="font-bold text-amber-600 dark:text-amber-400">
              {formatMoney(hovered.withdrawalsAmount)} ETB
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export interface DonutSlice {
  label: string;
  value: number;
  sublabel?: string;
  color: string;
}

interface InteractiveDonutChartProps {
  slices: DonutSlice[];
  centerTitle: string;
  centerValue: string;
  formatValue?: (v: number) => string;
}

export const InteractiveDonutChart: React.FC<InteractiveDonutChartProps> = ({
  slices,
  centerTitle,
  centerValue,
  formatValue = (v) => `${formatMoney(v)} ETB`,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const nonZero = slices.filter((s) => s.value > 0);
  const total = nonZero.reduce((sum, s) => sum + s.value, 0);

  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 58;
  const circumference = 2 * Math.PI * r;

  let cumulativeOffset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative w-40 h-40 shrink-0">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="18"
            className="text-slate-100 dark:text-[#172038]"
          />
          {total > 0 &&
            nonZero.map((slice, idx) => {
              const frac = slice.value / total;
              const dashLen = frac * circumference;
              const dashOffset = -cumulativeOffset;
              cumulativeOffset += dashLen;
              const isHovered = hoverIdx === idx;
              return (
                <circle
                  key={slice.label}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={isHovered ? 22 : 18}
                  strokeDasharray={`${dashLen} ${circumference}`}
                  strokeDashoffset={dashOffset}
                  strokeOpacity={hoverIdx !== null && !isHovered ? 0.35 : 1}
                  className="transition-all duration-150 cursor-pointer"
                  onMouseEnter={() => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
              );
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-400 truncate max-w-full">
            {hoverIdx !== null && nonZero[hoverIdx] ? nonZero[hoverIdx].label : centerTitle}
          </span>
          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-0.5 truncate max-w-full">
            {hoverIdx !== null && nonZero[hoverIdx]
              ? formatValue(nonZero[hoverIdx].value)
              : centerValue}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full flex flex-col gap-2">
        {nonZero.length === 0 ? (
          <div className="text-xs text-slate-400 dark:text-gray-500 py-4 text-center sm:text-left">
            No activity recorded in this period.
          </div>
        ) : (
          nonZero.map((slice, idx) => {
            const pct = total > 0 ? Math.round((slice.value / total) * 1000) / 10 : 0;
            const isHovered = hoverIdx === idx;
            return (
              <div
                key={slice.label}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border transition cursor-pointer ${
                  isHovered
                    ? "bg-slate-50 dark:bg-[#162038] border-slate-300 dark:border-[#2c3b61]"
                    : "border-transparent hover:bg-slate-50 dark:hover:bg-[#131b2e]"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: slice.color }}
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-800 dark:text-gray-200 block truncate">
                      {slice.label}
                    </span>
                    {slice.sublabel && (
                      <span className="text-[10px] text-slate-400 dark:text-gray-500 block">
                        {slice.sublabel}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-black text-slate-900 dark:text-white block">
                    {formatValue(slice.value)}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-gray-400">
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
