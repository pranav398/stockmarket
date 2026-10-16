import React from 'react';

interface StockChartProps {
  history: { time: string; price: number }[];
  basePrice: number;
  ticker: string;
}

export const StockChart: React.FC<StockChartProps> = ({ history, basePrice, ticker }) => {
  if (!history || history.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-xs text-slate-500 border border-[#1E293B] bg-[#0B0F17]">
        Waiting for price ticks for {ticker}...
      </div>
    );
  }

  const prices = history.map((h) => h.price);
  const current = prices[prices.length - 1];
  const isPositive = current >= basePrice;
  const strokeColor = isPositive ? '#10B981' : '#EF4444';
  const fillGradientId = `chart-grad-${ticker}`;

  const minPrice = Math.min(...prices, basePrice) * 0.995;
  const maxPrice = Math.max(...prices, basePrice) * 1.005;
  const range = Math.max(1, maxPrice - minPrice);

  const width = 720;
  const height = 210;
  const padX = 12;
  const padY = 18;

  const points = history.map((pt, idx) => {
    const x =
      history.length === 1
        ? width / 2
        : padX + (idx / (history.length - 1)) * (width - padX * 2);
    const y =
      height - padY - ((pt.price - minPrice) / range) * (height - padY * 2);
    return { x, y, ...pt };
  });

  const polylinePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPoints = `${points[0].x.toFixed(1)},${height - padY} ${polylinePoints} ${points[points.length - 1].x.toFixed(1)},${height - padY}`;

  const baseY =
    height - padY - ((basePrice - minPrice) / range) * (height - padY * 2);

  return (
    <div className="relative w-full h-56 bg-[#0B0F17] border border-[#1E293B] p-3 select-none overflow-hidden">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
        <div className="flex items-center gap-2 font-mono tabular-nums">
          <span className="text-slate-300 font-semibold">{ticker} LIVE FEED</span>
          <span>·</span>
          <span>BASE {basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex items-center gap-3 font-mono tabular-nums text-[11px]">
          <span>HIGH {Math.max(...prices).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span>·</span>
          <span>LOW {Math.min(...prices).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-44 overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.24" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0.2, 0.5, 0.8].map((ratio, i) => (
          <line
            key={i}
            x1={padX}
            y1={height * ratio}
            x2={width - padX}
            y2={height * ratio}
            stroke="#1E293B"
            strokeDasharray="2 4"
            strokeWidth="1"
          />
        ))}

        {/* Base price reference line */}
        {baseY >= padY && baseY <= height - padY && (
          <line
            x1={padX}
            y1={baseY}
            x2={width - padX}
            y2={baseY}
            stroke="#475569"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
        )}

        {/* Shaded area under curve */}
        {points.length > 1 && (
          <polygon points={areaPoints} fill={`url(#${fillGradientId})`} />
        )}

        {/* Main price line */}
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />
        )}

        {/* Latest price pulse node */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r="4"
            fill={strokeColor}
          />
        )}
      </svg>
    </div>
  );
};
