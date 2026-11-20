import { TrendingUp } from "lucide-react";
import { formatPercentage } from "@/lib/dashboard/metrics";
import type { ReportModel } from "@/lib/report-data";

const W = 760;
const H = 285;
const PLOT_LEFT = 30;
const PLOT_RIGHT = 706;
const PLOT_TOP = 42;
const PLOT_BOTTOM = 213;
const POINTS_PER_PANEL = 11;

function scoreAxis(scores: number[]) {
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const padding = Math.max(1, (max - min) / 10);
  const span = max - min + 2 * padding;
  const step = [1, 2, 5, 10, 20, 25].find((step) => span / step <= 6) ?? 25;
  // Keep close scores easy to compare; round wider ranges to full tick steps.
  const boundsStep = step <= 2 ? 1 : step;
  const lower = Math.max(0, Math.floor((min - padding) / boundsStep) * boundsStep);
  const upper = Math.min(100, Math.ceil((max + padding) / boundsStep) * boundsStep);
  const ticks = [lower];
  for (
    let tick = Math.ceil((lower + step / 2) / step) * step;
    tick <= upper - step / 2;
    tick += step
  )
    ticks.push(tick);
  ticks.push(upper);
  return { lower, upper, ticks };
}

type Point = ReportModel["history"][number] & { delta: number | null; afterGap: boolean };

function monthNumber(month: string) {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
}

function trendPoints(history: ReportModel["history"]): Point[] {
  const valid = history.filter(({ score }) => Number.isFinite(score) && score >= 0 && score <= 100);
  return valid.map((entry, index) => {
    const previous = valid[index - 1];
    return {
      ...entry,
      delta: previous ? Number((entry.score - previous.score).toFixed(2)) : null,
      afterGap: !!previous && monthNumber(entry.month) - monthNumber(previous.month) !== 1,
    };
  });
}

export function PdfMonthlyTrend({
  history,
  currentMonth,
}: {
  history: ReportModel["history"];
  currentMonth: string;
}) {
  const points = trendPoints(history);
  if (points.length === 0) return null;
  const { lower, upper, ticks } = scoreAxis(points.map(({ score }) => score));
  const y = (score: number) =>
    PLOT_BOTTOM - ((score - lower) / (upper - lower)) * (PLOT_BOTTOM - PLOT_TOP);
  const panels: Point[][] = [];

  // Keep labels readable if the report spans multiple years. Repeat the
  // boundary point to carry the connecting segment onto the next panel.
  for (let start = 0; start < points.length; start += POINTS_PER_PANEL - 1) {
    panels.push(points.slice(start, start + POINTS_PER_PANEL));
    if (start + POINTS_PER_PANEL >= points.length) break;
  }

  return (
    <>
      {panels.map((panel, panelIndex) => {
        const gap = (PLOT_RIGHT - PLOT_LEFT) / panel.length;
        const marks = panel.map((point, i) => ({
          ...point,
          x: PLOT_LEFT + (i + 0.5) * gap,
          y: y(point.score),
        }));
        return (
          <section
            key={panel[0]!.month}
            data-report-block
            className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-primary">
              <TrendingUp className="size-4" /> اتجاه درجات الفرع حسب الشهر
              {panels.length > 1 && (
                <span className="text-slate-600" dir="ltr">
                  ({panelIndex + 1}/{panels.length})
                </span>
              )}
            </h3>
            <svg
              direction="ltr"
              role="img"
              aria-label={panel
                .map(({ month, score }) => `${month}: ${formatPercentage(score)}%`)
                .join("، ")}
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                fontFamily: "Arial, sans-serif",
              }}
            >
              <rect
                x="0.5"
                y="0.5"
                width={W - 1}
                height={H - 1}
                rx="12"
                fill="#fbfefd"
                stroke="#dce9e1"
              />
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={PLOT_LEFT}
                    x2={PLOT_RIGHT}
                    y1={y(tick)}
                    y2={y(tick)}
                    stroke={tick === lower ? "#bfcfc6" : "#e0ebe4"}
                  />
                  <text
                    x={738}
                    y={y(tick)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fill="#435b50"
                    fontSize={12}
                  >
                    {tick}%
                  </text>
                </g>
              ))}
              {marks.map((mark) => (
                <line
                  key={mark.month}
                  x1={mark.x}
                  x2={mark.x}
                  y1={mark.y}
                  y2={PLOT_BOTTOM}
                  stroke="#e4efe8"
                />
              ))}
              {marks.slice(1).map((mark, i) => (
                <line
                  key={mark.month}
                  x1={marks[i]!.x}
                  y1={marks[i]!.y}
                  x2={mark.x}
                  y2={mark.y}
                  stroke="#14744e"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={mark.afterGap ? "5 5" : undefined}
                />
              ))}
              {marks.map((mark, i) => {
                const current = mark.month === currentMonth;
                const delta = panelIndex > 0 && i === 0 ? null : mark.delta;
                const down = delta !== null && delta < 0;
                const flat = delta === 0;
                return (
                  <g key={mark.month}>
                    {current && <circle cx={mark.x} cy={mark.y} r={9} fill="#dcefe5" />}
                    <circle
                      cx={mark.x}
                      cy={mark.y}
                      r={4.5}
                      fill="white"
                      stroke="#14744e"
                      strokeWidth={2.5}
                    />
                    <rect
                      x={mark.x - 27}
                      y={mark.y - 31}
                      width={54}
                      height={21}
                      rx={6}
                      fill={current ? "#e4f4ec" : "white"}
                      stroke="#cfe5d7"
                    />
                    <text
                      x={mark.x}
                      y={mark.y - 20}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#154936"
                      fontSize={12}
                      fontWeight="bold"
                    >
                      {formatPercentage(mark.score)}%
                    </text>
                    <text
                      x={mark.x}
                      y={234}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#154936"
                      fontSize={11}
                      fontWeight="bold"
                    >
                      {mark.month}
                    </text>
                    {delta !== null && (
                      <>
                        <rect
                          x={mark.x - 24}
                          y={249}
                          width={48}
                          height={20}
                          rx={9}
                          fill={down ? "#fcefeb" : flat ? "#f0f4f2" : "#e9f5ee"}
                        />
                        <text
                          x={mark.x}
                          y={260}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={down ? "#922e22" : flat ? "#435b50" : "#154936"}
                          fontSize={11}
                          fontWeight="bold"
                        >
                          {delta > 0 ? "+" : ""}
                          {formatPercentage(delta)}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-700">
              {(lower !== 0 || upper !== 100) && "المحور الرأسي مُقرّب لإظهار الفروق. "}
              {points.length > 1 &&
                "الأرقام تحت الشهور هي التغيّر بالنقاط المئوية عن آخر شهر ظاهر. "}
              {panel.some(({ afterGap }) => afterGap) &&
                "الخط المتقطع يشير إلى شهور من غير بيانات."}
            </p>
          </section>
        );
      })}
    </>
  );
}
