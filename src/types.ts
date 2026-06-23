export type OptionSide = 'call' | 'put';
export type TicketSide = 'buy' | 'sell';
export type TerminalMode = 'active' | 'research';

export interface UnderlyingQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  impliedVolatility: number;
  source: 'mock';
}

export interface OptionChainRow {
  contractTicker: string;
  type: OptionSide;
  expiry: string;
  strike: number;
  bid: number;
  ask: number;
  mark: number;
  volume: number;
  openInterest: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  quoteTimestamp: string;
  quoteTradable: boolean;
}

export interface VolatilityPoint {
  label: string;
  atmIv: number;
  realizedVol: number;
  skew25d: number;
}

export interface LimitLadder {
  patient: number;
  fair: number;
  aggressive: number;
}

export interface LiquidityStrike {
  strike: number;
  volume: number;
  openInterest: number;
  concentration: number;
}

export type TicketVerdict = 'tradable' | 'watch_only' | 'blocked';

export interface QuoteTicket {
  side: TicketSide;
  row: OptionChainRow;
  mid: number;
  spread: number;
  spreadPct: number;
  quoteAgeSeconds: number;
  ladder: LimitLadder;
  liquidity: LiquidityStrike[];
  verdict: TicketVerdict;
  warnings: string[];
}
