import { MousePointer2 } from 'lucide-react';
import type { OptionChainRow, TicketSide } from '../types';

interface OptionChainTableProps {
  rows: OptionChainRow[];
  selectedTicker: string;
  side: TicketSide;
  onSelect: (row: OptionChainRow, side: TicketSide) => void;
}

export function OptionChainTable({ rows, selectedTicker, side, onSelect }: OptionChainTableProps) {
  return (
    <section className="panel chain-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">Option Chain</div>
          <h2>Selected Expiry / Strike Window</h2>
        </div>
        <span className="pill">BBO only · no depth</span>
      </div>

      <div className="chain-scroll">
        <table>
          <thead>
            <tr>
              <th>Contract</th>
              <th>Bid</th>
              <th>Ask</th>
              <th>Mark</th>
              <th>IV</th>
              <th>Vol/OI</th>
              <th>Greeks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isSelected = row.contractTicker === selectedTicker;
              return (
                <tr key={row.contractTicker} className={isSelected ? 'selected-row' : ''}>
                  <td>
                    <div className="contract-cell">
                      <strong>{row.expiry}</strong>
                      <span>{row.strike}{row.type.toUpperCase()[0]}</span>
                    </div>
                  </td>
                  <td>
                    <button className="quote-button bid" onClick={() => onSelect(row, 'sell')}>
                      {row.bid.toFixed(2)}
                    </button>
                  </td>
                  <td>
                    <button className="quote-button ask" onClick={() => onSelect(row, 'buy')}>
                      {row.ask.toFixed(2)}
                    </button>
                  </td>
                  <td>{row.mark.toFixed(2)}</td>
                  <td>{(row.iv * 100).toFixed(1)}%</td>
                  <td>{row.volume.toLocaleString()} / {row.openInterest.toLocaleString()}</td>
                  <td className="greeks">Δ {row.delta.toFixed(2)} · Θ {row.theta.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel-note">
        <MousePointer2 size={14} />
        Click bid to model sell-side limit prices, ask to model buy-side limit prices.
      </div>
    </section>
  );
}
