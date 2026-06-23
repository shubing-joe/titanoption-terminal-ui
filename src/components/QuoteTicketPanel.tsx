import { AlertTriangle, CheckCircle2, Gauge, TimerReset } from 'lucide-react';
import type { QuoteTicket } from '../types';

interface QuoteTicketPanelProps {
  ticket: QuoteTicket;
}

export function QuoteTicketPanel({ ticket }: QuoteTicketPanelProps) {
  const contract = `${ticket.row.expiry} ${ticket.row.strike}${ticket.row.type.toUpperCase()[0]}`;
  return (
    <section className="panel ticket-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">Quote Ticket</div>
          <h2>{ticket.side.toUpperCase()} {contract}</h2>
        </div>
        <span className={`pill verdict ${ticket.verdict}`}>
          {ticket.verdict === 'tradable' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {ticket.verdict}
        </span>
      </div>

      <div className="ticket-grid">
        <div className="metric">
          <span>Bid</span>
          <strong>{ticket.row.bid.toFixed(2)}</strong>
        </div>
        <div className="metric">
          <span>Mid</span>
          <strong>{ticket.mid.toFixed(2)}</strong>
        </div>
        <div className="metric">
          <span>Ask</span>
          <strong>{ticket.row.ask.toFixed(2)}</strong>
        </div>
        <div className="metric">
          <span>Spread</span>
          <strong>{ticket.spread.toFixed(2)} · {ticket.spreadPct.toFixed(2)}%</strong>
        </div>
      </div>

      <div className="ladder">
        <div>
          <span>Patient</span>
          <strong>{ticket.ladder.patient.toFixed(2)}</strong>
        </div>
        <div>
          <span>Fair</span>
          <strong>{ticket.ladder.fair.toFixed(2)}</strong>
        </div>
        <div>
          <span>Aggressive</span>
          <strong>{ticket.ladder.aggressive.toFixed(2)}</strong>
        </div>
      </div>

      <div className="freshness">
        <TimerReset size={15} />
        Quote age {ticket.quoteAgeSeconds}s · active monitor mock
      </div>

      {ticket.warnings.length > 0 && (
        <div className="warnings">
          {ticket.warnings.map(item => (
            <div key={item}><AlertTriangle size={14} /> {item}</div>
          ))}
        </div>
      )}

      <div className="liquidity">
        <div className="subheading">
          <Gauge size={15} />
          Same-expiry liquidity by strike
        </div>
        {ticket.liquidity.map(item => (
          <div className="liquidity-row" key={item.strike}>
            <span>{item.strike}</span>
            <div className="bar">
              <i style={{ width: `${Math.max(8, item.concentration * 100)}%` }} />
            </div>
            <em>{Math.round(item.concentration * 100)}%</em>
          </div>
        ))}
      </div>

      <div className="panel-note">
        This panel models BBO-based limit prices only. It does not submit orders and does not show level-2 depth.
      </div>
    </section>
  );
}
