import { LineChart, Waves } from 'lucide-react';
import type { VolatilityPoint } from '../types';

interface VolatilityWorkbenchProps {
  points: VolatilityPoint[];
}

export function VolatilityWorkbench({ points }: VolatilityWorkbenchProps) {
  const maxIv = Math.max(...points.map(point => point.atmIv));
  return (
    <section className="panel vol-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">Volatility Workbench</div>
          <h2>Term Structure / Skew Mock View</h2>
        </div>
        <span className="pill">
          <Waves size={14} />
          fallback-safe UI state
        </span>
      </div>

      <div className="vol-bars">
        {points.map(point => (
          <div className="vol-row" key={point.label}>
            <span>{point.label}</span>
            <div className="vol-track">
              <i style={{ width: `${(point.atmIv / maxIv) * 100}%` }} />
            </div>
            <strong>{point.atmIv.toFixed(1)}%</strong>
            <em>RV {point.realizedVol.toFixed(1)} · skew {point.skew25d.toFixed(1)}</em>
          </div>
        ))}
      </div>

      <div className="empty-state">
        <LineChart size={16} />
        Real backend vol surface is intentionally absent here. Use this area to refine layout, fallback labels, and empty states.
      </div>
    </section>
  );
}
