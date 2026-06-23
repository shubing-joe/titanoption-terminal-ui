import { useMemo, useState } from 'react';
import { mockChainRows, mockUnderlying, mockVolatility } from './fixtures/mockTerminalData';
import { buildQuoteTicket } from './lib/quoteTicket';
import type { OptionChainRow, TerminalMode, TicketSide } from './types';
import { OptionChainTable } from './components/OptionChainTable';
import { QuoteTicketPanel } from './components/QuoteTicketPanel';
import { StatusStrip } from './components/StatusStrip';
import { VolatilityWorkbench } from './components/VolatilityWorkbench';

const nowIso = '2026-06-23T14:30:03.000Z';

export default function App() {
  const [mode, setMode] = useState<TerminalMode>('active');
  const [selectedRow, setSelectedRow] = useState<OptionChainRow>(mockChainRows[1]);
  const [ticketSide, setTicketSide] = useState<TicketSide>('buy');

  const ticket = useMemo(
    () => buildQuoteTicket(selectedRow, mockChainRows, ticketSide, nowIso),
    [selectedRow, ticketSide],
  );

  const handleSelect = (row: OptionChainRow, side: TicketSide) => {
    setSelectedRow(row);
    setTicketSide(side);
  };

  return (
    <main className="app-shell">
      <StatusStrip underlying={mockUnderlying} mode={mode} onModeChange={setMode} />

      <div className="workspace-title">
        <div>
          <div className="eyebrow">Public UI Sandbox</div>
          <h2>Options chain, quote ticket, and volatility panels for frontend collaboration</h2>
        </div>
        <p>
          This repository is deliberately separated from the private trading system. It is for UI work, mock data states, and PR review only.
        </p>
      </div>

      <div className="terminal-grid">
        <div className="left-stack">
          <OptionChainTable
            rows={mockChainRows}
            selectedTicker={selectedRow.contractTicker}
            side={ticketSide}
            onSelect={handleSelect}
          />
          <VolatilityWorkbench points={mockVolatility} />
        </div>
        <QuoteTicketPanel ticket={ticket} />
      </div>
    </main>
  );
}
