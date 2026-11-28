'use client';

/**
 * Dependency-free, responsive SVG charts. No external library needed:
 * they scale with the viewBox, stay crisp in RTL/LTR (charts are forced LTR),
 * and animate the draw-in via CSS.
 */
import { useId } from 'react';

export function AreaChart({ values, color = 'var(--color-brand-500)', height = 180, labels }: {
  values: number[];
  color?: string;
  height?: number;
  labels?: string[];
}) {
  const id = useId().replace(/[:]/g, '');
  const width = 600;
  const pad = 18;
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const points = values.map((v, i) => [pad + i * stepX, height - pad - (v / max) * (height - pad * 2)] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${(points[points.length - 1]?.[0] ?? width - pad).toFixed(1)},${height - pad} L${pad},${height - pad} Z`;

  if (values.length === 0) {
    return <div className="flex items-center justify-center text-sm faint" style={{ height }}>—</div>;
  }

  return (
    <div className="w-full" dir="ltr">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="chart">
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id={`stroke-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor="var(--color-accent-500)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad} x2={width - pad} y1={height * f} y2={height * f} stroke="var(--border)" strokeDasharray="3 5" strokeWidth="1" />
        ))}
        <path d={area} fill={`url(#fill-${id})`} />
        <path d={line} fill="none" stroke={`url(#stroke-${id})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'ats-bar-grow 0.8s ease both', transformOrigin: 'bottom' }} />
        {points.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="3.6" fill="var(--surface-solid)" stroke={color} strokeWidth="2.2" />
            <title>{labels?.[i] ? `${labels[i]}: ${values[i]}` : String(values[i])}</title>
          </g>
        ))}
      </svg>
      {labels?.length ? (
        <div className="mt-1 flex justify-between gap-1 text-[0.62rem] font-bold faint">
          {labels.map((l, i) => <span key={i} className="truncate">{l}</span>)}
        </div>
      ) : null}
    </div>
  );
}

export function Sparkline({ values, color = 'var(--color-brand-500)', width = 120, height = 34 }: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span style={{ width, height }} aria-hidden="true" />;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - 3 - ((v - min) / range) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MiniBars({ values, color = 'var(--color-brand-500)', height = 34 }: {
  values: number[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1" style={{ height }} aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-sm"
          style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: i === values.length - 1 ? color : 'color-mix(in srgb, ' + color + ' 38%, transparent)' }}
        />
      ))}
    </div>
  );
}

/** Horizontal performance bar with label + value, used for workload. */
export function HBar({ label, value, max, color = 'var(--color-brand-500)', suffix }: {
  label: string;
  value: number;
  max: number;
  color?: string;
  suffix?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs font-bold" style={{ color: 'var(--text-2)' }} title={label}>{label}</span>
        <span className="shrink-0 text-xs font-extrabold tabular-nums" style={{ color: 'var(--text-1)' }}>{value}{suffix}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-hover)' }}>
        <div className="chart-fill h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 55%, #fff))` }} />
      </div>
    </div>
  );
}
