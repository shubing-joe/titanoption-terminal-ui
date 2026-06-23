import { Activity, Database, GitPullRequest, ShieldAlert } from 'lucide-react';
import type { TerminalMode, UnderlyingQuote } from '../types';

interface StatusStripProps {
  underlying: UnderlyingQuote;
  mode: TerminalMode;
  onModeChange: (mode: TerminalMode) => void;
}

export function StatusStrip({ underlying, mode, onModeChange }: StatusStripProps) {
  return (
    <header className="status-strip">
      <div className="brand-block">
        <div className="brand-icon">
          <Activity size={20} />
        </div>
        <div>
          <div className="eyebrow">TitanOption Terminal UI Sandbox</div>
          <h1>Generic Options Workbench</h1>
        </div>
      </div>

      <div className="status-cluster">
        <span className="pill danger">
          <ShieldAlert size={14} />
          MOCK DATA - NOT FOR TRADING
        </span>
        <span className="pill">
          <Database size={14} />
          {underlying.symbol} ${underlying.price.toFixed(2)} · IV {underlying.impliedVolatility.toFixed(1)}%
        </span>
        <span className="pill">
          <GitPullRequest size={14} />
          PR-ready frontend sandbox
        </span>
        <div className="segmented" aria-label="Terminal mode">
          {(['active', 'research'] as const).map(item => (
            <button
              key={item}
              type="button"
              className={mode === item ? 'selected' : ''}
              onClick={() => onModeChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
