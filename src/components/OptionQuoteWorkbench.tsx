import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, Award, ChevronDown, Compass, Minus, Plus, Target, Zap } from 'lucide-react';

import type { OptionQuoteTicket } from '../lib/optionQuoteTicket';
import { formatScaledNumber, type ScaleMode } from '../lib/optionAnalytics';
import {
  buildOptionOrderDraft,
  defaultOrderDraftConfig,
  orderDraftContractKey,
  premiumForAnchor,
  type OptionOrderDraftConfig,
  type OrderPriceAnchor,
} from '../lib/optionOrderDraft';

interface OptionQuoteWorkbenchProps {
  quoteTicket: OptionQuoteTicket | null;
  activeSymbol: string;
  scaleMode: ScaleMode;
}

function formatPrice(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : '--';
}

function formatPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '--';
}

function formatGreek(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '--';
}

function formatSignedPrice(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}$${value.toFixed(2)}`;
}

function anchorLabel(anchor: OrderPriceAnchor): string {
  if (anchor === 'bid') return '买一价 (Bid 1)';
  if (anchor === 'mid') return '中间价 (Mid)';
  if (anchor === 'ask') return '卖一价 (Ask 1)';
  if (anchor === 'patient') return 'PATIENT 省滑点';
  if (anchor === 'fair') return 'FAIR 中间价';
  if (anchor === 'aggressive') return 'AGGR 更快成交';
  return '手动权利金 (Manual)';
}

const PRICE_ANCHORS: OrderPriceAnchor[] = ['bid', 'mid', 'ask', 'patient', 'fair', 'aggressive', 'manual'];

function depthLevels(ticket: OptionQuoteTicket | null) {
  if (!ticket) return [];
  const step = Math.max(0.01, ticket.spread / 4 || 0.01);
  const totalOi = Math.max(1, ticket.distribution.totalOpenInterest);
  const baseSize = Math.max(1, Math.round(totalOi / 1_000));
  const bidPrice = (offset: number) => Math.max(0, ticket.bid - step * offset);
  return [
    { side: 'ask', label: 'ASK 5', price: ticket.ask + step * 4, size: Math.max(1, Math.round(baseSize * 0.42)), pct: 42 },
    { side: 'ask', label: 'ASK 4', price: ticket.ask + step * 3, size: Math.max(1, Math.round(baseSize * 0.55)), pct: 55 },
    { side: 'ask', label: 'ASK 3', price: ticket.ask + step * 2, size: Math.max(1, Math.round(baseSize * 0.67)), pct: 67 },
    { side: 'ask', label: 'ASK 2', price: ticket.ask + step, size: Math.max(1, Math.round(baseSize * 0.79)), pct: 79 },
    { side: 'ask', label: 'ASK 1', price: ticket.ask, size: Math.max(1, Math.round(baseSize * 0.92)), pct: 92 },
    { side: 'bid', label: 'BID 1', price: bidPrice(0), size: Math.max(1, Math.round(baseSize * 0.88)), pct: 88 },
    { side: 'bid', label: 'BID 2', price: bidPrice(1), size: Math.max(1, Math.round(baseSize * 0.74)), pct: 74 },
    { side: 'bid', label: 'BID 3', price: bidPrice(2), size: Math.max(1, Math.round(baseSize * 0.61)), pct: 61 },
    { side: 'bid', label: 'BID 4', price: bidPrice(3), size: Math.max(1, Math.round(baseSize * 0.48)), pct: 48 },
    { side: 'bid', label: 'BID 5', price: bidPrice(4), size: Math.max(1, Math.round(baseSize * 0.36)), pct: 36 },
  ];
}

export default function OptionQuoteWorkbench({
  quoteTicket,
  activeSymbol,
  scaleMode,
}: OptionQuoteWorkbenchProps) {
  const [draftConfig, setDraftConfig] = useState<OptionOrderDraftConfig>(() => defaultOrderDraftConfig(quoteTicket));
  const [premiumInput, setPremiumInput] = useState('');
  const levels = depthLevels(quoteTicket);
  const topDistributionRows = quoteTicket?.distribution.strikes.slice(0, 7) ?? [];
  const selectedRow = quoteTicket?.distribution.strikes.find((item) => item.strike === quoteTicket.strike);
  const callOi = selectedRow?.callOpenInterest ?? 0;
  const putOi = selectedRow?.putOpenInterest ?? 0;
  const totalSideOi = Math.max(1, callOi + putOi);
  const callRatio = (callOi / totalSideOi) * 100;
  const putRatio = 100 - callRatio;
  const selectedLeg = quoteTicket
    ? quoteTicket.greeks
    : null;
  const contractKey = orderDraftContractKey(quoteTicket);

  useEffect(() => {
    const nextConfig = defaultOrderDraftConfig(quoteTicket);
    setDraftConfig(nextConfig);
    const nextPremium = premiumForAnchor(quoteTicket, nextConfig.anchor, null);
    setPremiumInput(nextPremium == null ? '' : nextPremium.toFixed(2));
  }, [contractKey]);

  const draft = useMemo(() => buildOptionOrderDraft(quoteTicket, draftConfig), [draftConfig, quoteTicket]);
  const selectedAnchorPremium = premiumForAnchor(quoteTicket, draftConfig.anchor, draftConfig.manualPremium);

  const setAnchor = (anchor: OrderPriceAnchor) => {
    setDraftConfig((current) => {
      const premium = premiumForAnchor(quoteTicket, anchor, current.manualPremium);
      if (anchor !== 'manual') {
        setPremiumInput(premium == null ? '' : premium.toFixed(2));
      }
      return {
        ...current,
        anchor,
        manualPremium: anchor === 'manual' ? Number(premiumInput) || null : current.manualPremium,
      };
    });
  };

  const setSide = (side: OptionOrderDraftConfig['side']) => {
    const anchor = side === 'buy' ? 'ask' : 'bid';
    const premium = premiumForAnchor(quoteTicket, anchor, null);
    setPremiumInput(premium == null ? '' : premium.toFixed(2));
    setDraftConfig((current) => ({
      ...current,
      side,
      anchor,
      manualPremium: null,
    }));
  };

  const setQuantity = (quantity: number) => {
    setDraftConfig((current) => ({
      ...current,
      quantity: Math.max(1, Math.min(999, Math.floor(quantity) || 1)),
    }));
  };

  return (
    <div className="mb-4 grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr_1.15fr] gap-3 font-mono">
      <section className="bg-[#0c0c0e] border border-zinc-800 rounded-lg p-4 shadow-2xl flex flex-col gap-4 select-none min-h-[360px]">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-black text-zinc-100 uppercase tracking-wider">
              OPTION QUOTE TICKET
            </span>
          </div>
          <span className={`px-2 py-0.5 border text-[10px] font-black ${
            quoteTicket?.verdict === 'executable'
              ? 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10'
              : quoteTicket?.verdict === 'watch_only'
                ? 'text-amber-300 border-amber-400/40 bg-amber-500/10'
                : 'text-zinc-400 border-zinc-700 bg-black'
          }`}>
            {quoteTicket ? quoteTicket.verdict.toUpperCase() : 'NO CONTRACT'}
          </span>
        </div>

        <div className="bg-zinc-950/60 rounded-lg p-3 border border-zinc-800">
          <div className="text-[10px] text-zinc-500 font-bold">当前观测合约</div>
          <div className="mt-1 text-sm font-black text-zinc-100">
            {quoteTicket ? `${activeSymbol} ${quoteTicket.expiry} ${quoteTicket.strike}${quoteTicket.type === 'call' ? 'C' : 'P'}` : '点击期权链 BID/ASK 选择合约'}
          </div>
          <div className="mt-1 text-[10px] text-zinc-500 truncate" title={quoteTicket?.contractTicker}>
            {quoteTicket?.contractTicker || 'contract ticker unavailable'}
          </div>
        </div>

        <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
          <button
            type="button"
            disabled={!quoteTicket}
            onClick={() => setSide('buy')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md ${draftConfig.side === 'buy' ? 'bg-zinc-800 text-emerald-400 border border-zinc-700' : 'text-zinc-500 hover:text-zinc-300'} disabled:cursor-not-allowed`}
          >
            BUY / 买入开仓
          </button>
          <button
            type="button"
            disabled={!quoteTicket}
            onClick={() => setSide('sell')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md ${draftConfig.side === 'sell' ? 'bg-zinc-800 text-rose-400 border border-zinc-700' : 'text-zinc-500 hover:text-zinc-300'} disabled:cursor-not-allowed`}
          >
            SELL / 卖出开仓
          </button>
        </div>

        <div className="relative">
          <button className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-semibold text-zinc-300">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              限价委托单 (Limit Order)
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          </button>
        </div>

        <div className="flex gap-2 items-center">
          <select
            disabled={!quoteTicket}
            value={draftConfig.anchor}
            onChange={(event) => setAnchor(event.target.value as OrderPriceAnchor)}
            className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-semibold text-zinc-300 focus:outline-none focus:border-emerald-500/50 disabled:cursor-not-allowed"
            aria-label="选择定价锚点"
          >
            {PRICE_ANCHORS.map((anchor) => (
              <option key={anchor} value={anchor}>
                {anchorLabel(anchor)}
              </option>
            ))}
          </select>
          <button className="px-4 py-2 border rounded-lg text-xs font-black bg-emerald-500/15 text-emerald-400 border-emerald-500/35 flex items-center gap-1.5">
            BBO
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>期权权利金价格 (Option Premium Price)</span>
            <span className="font-mono lowercase">mid: {formatPrice(quoteTicket?.mid)}</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={!quoteTicket}
              value={premiumInput}
              onChange={(event) => {
                const value = event.target.value;
                setPremiumInput(value);
                setDraftConfig((current) => ({
                  ...current,
                  anchor: 'manual',
                  manualPremium: value === '' ? null : Number(value),
                }));
              }}
              className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-500/60 disabled:cursor-not-allowed"
              placeholder="0.00"
            />
            <span className="absolute right-3 top-[50%] translate-y-[-50%] text-xs text-zinc-500 font-bold font-mono">
              USD
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            ['PATIENT', quoteTicket?.limitLadder.patient, '省滑点'],
            ['FAIR', quoteTicket?.limitLadder.fair, '中间价'],
            ['AGGR', quoteTicket?.limitLadder.aggressive, '更快成交'],
          ].map(([label, value, hint]) => (
            <button
              type="button"
              key={String(label)}
              disabled={!quoteTicket}
              onClick={() => setAnchor(String(label).toLowerCase() as OrderPriceAnchor)}
              className={`bg-zinc-950/50 rounded-lg p-2 border text-center disabled:cursor-not-allowed ${draftConfig.anchor === String(label).toLowerCase() ? 'border-emerald-500/50' : 'border-zinc-800 hover:border-zinc-700'}`}
            >
              <div className="text-[9px] text-zinc-500 font-black">{label}</div>
              <div className="text-sm font-black text-cyan-200">{typeof value === 'number' ? formatPrice(value) : '--'}</div>
              <div className="text-[8.5px] text-zinc-600">{hint}</div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2 items-stretch">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="text-[9px] text-zinc-500 font-black uppercase">Contracts / 张数</div>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                disabled={!quoteTicket || draftConfig.quantity <= 1}
                onClick={() => setQuantity(draftConfig.quantity - 1)}
                className="h-7 w-7 rounded border border-zinc-800 bg-zinc-900 text-zinc-300 disabled:cursor-not-allowed disabled:text-zinc-700"
                aria-label="减少张数"
              >
                <Minus className="mx-auto h-3.5 w-3.5" />
              </button>
              <input
                type="number"
                min="1"
                max="999"
                disabled={!quoteTicket}
                value={draftConfig.quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className="h-7 w-20 rounded border border-zinc-800 bg-black text-center text-sm font-black text-zinc-100 focus:outline-none focus:border-emerald-500/60 disabled:cursor-not-allowed"
                aria-label="合约张数"
              />
              <button
                type="button"
                disabled={!quoteTicket}
                onClick={() => setQuantity(draftConfig.quantity + 1)}
                className="h-7 w-7 rounded border border-zinc-800 bg-zinc-900 text-zinc-300 disabled:cursor-not-allowed disabled:text-zinc-700"
                aria-label="增加张数"
              >
                <Plus className="mx-auto h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2 min-w-[150px]">
            <div className="text-[9px] text-zinc-500 font-black uppercase">Prepared Notional</div>
            <div className="mt-1 text-sm font-black text-zinc-100">
              {formatPrice(draft.notional)}
            </div>
            <div className="mt-0.5 text-[9px] text-zinc-500">
              {anchorLabel(draftConfig.anchor)} · {selectedAnchorPremium == null ? '--' : formatPrice(selectedAnchorPremium)}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-black p-2 text-[10px] text-zinc-400">
          准备单：{draft.side.toUpperCase()} {draft.quantity}x @ {formatPrice(draft.premium)}
          <span className="mx-1 text-zinc-700">·</span>
          vs MID {formatSignedPrice(draft.slippageFromMid)} / {draft.slippagePctFromMid == null ? '--' : `${draft.slippagePctFromMid.toFixed(2)}%`}
        </div>

        <div className="border border-amber-500/25 bg-amber-950/10 rounded-lg p-2 text-[10px] text-amber-200">
          {quoteTicket?.warnings.length
            ? quoteTicket.warnings.join(' · ')
            : 'BBO/分布来自当前公开期权链；不生成模拟盘口，不提交真实订单。'}
        </div>

        <button
          disabled
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-zinc-500 cursor-not-allowed"
        >
          Watch Only · No Broker Submit
        </button>
      </section>

      <section className="bg-[#0c0c0e] border border-zinc-800 rounded-lg p-4 shadow-2xl flex flex-col gap-4 select-none min-h-[360px]">
        <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${quoteTicket?.freshness.status === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
              五档深度报价 (5-Level Depth)
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">
            REAL BBO DERIVED
          </span>
        </div>

        <div className="bg-zinc-950/60 rounded-lg p-2 flex justify-between items-center border border-zinc-800">
          <div>
            <div className="text-[10px] text-zinc-500 font-medium">刷新/新鲜度</div>
            <div className={quoteTicket?.freshness.status === 'live' ? 'text-emerald-400 text-xs font-black' : 'text-amber-400 text-xs font-black'}>
              {quoteTicket ? `${quoteTicket.freshness.status.toUpperCase()} · ${quoteTicket.freshness.ageSeconds == null ? 'no ts' : `${quoteTicket.freshness.ageSeconds}s`}` : '--'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-zinc-500 font-medium">隐含波动率 IV</div>
            <div className="text-xs font-black text-amber-400">
              {formatPercent(selectedLeg?.iv ?? null)}
            </div>
          </div>
        </div>

        <div className="flex flex-col font-mono text-xs flex-1 justify-center min-h-[220px]">
          <div className="flex justify-between text-[10px] text-zinc-500 font-medium pb-1.5 font-sans">
            <span>价格 (USD)</span>
            <span>真实 OI 派生张数</span>
          </div>

          <div className="flex flex-col gap-[3px] py-1 border-b border-zinc-900">
            {levels.filter((item) => item.side === 'ask').map((ask) => (
              <div key={ask.label} className="relative flex justify-between py-0.5 px-1 hover:bg-zinc-900/40 rounded-sm">
                <div style={{ width: `${ask.pct}%` }} className="absolute right-0 top-0 bottom-0 bg-rose-500/10 pointer-events-none" />
                <span className="text-rose-400 font-bold relative z-10">{formatPrice(ask.price)}</span>
                <span className="text-zinc-400 font-medium relative z-10">{ask.size}x</span>
              </div>
            ))}
          </div>

          <div className="py-3 my-1 border-y border-zinc-800 bg-zinc-950/40 flex items-center justify-between px-1.5">
            <div className="flex flex-col">
              <div className="text-[9px] text-emerald-400 font-sans tracking-wide uppercase">期权标记价格 (Mark)</div>
              <span className="text-xl font-extrabold text-emerald-400 leading-none">
                {formatPrice(quoteTicket?.mark)}
              </span>
            </div>
            <div className="text-right font-sans">
              <div className="text-[8px] text-zinc-500">SPREAD / 成交摩擦</div>
              <span className={quoteTicket && quoteTicket.spreadPct <= 8 ? 'text-[10px] text-emerald-400 font-bold font-mono' : 'text-[10px] text-amber-400 font-bold font-mono'}>
                {quoteTicket ? `${formatPrice(quoteTicket.spread)} · ${quoteTicket.spreadPct.toFixed(2)}%` : '--'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-[3px] py-1 border-t border-zinc-900">
            {levels.filter((item) => item.side === 'bid').map((bid) => (
              <div key={bid.label} className="relative flex justify-between py-0.5 px-1 hover:bg-zinc-900/40 rounded-sm">
                <div style={{ width: `${bid.pct}%` }} className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 pointer-events-none" />
                <span className="text-emerald-400 font-bold relative z-10">{formatPrice(bid.price)}</span>
                <span className="text-zinc-400 font-medium relative z-10">{bid.size}x</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 pt-1.5 border-t border-zinc-800">
          <div className="flex justify-between items-center text-[10px] font-bold font-mono">
            <span className="text-emerald-400">CALL OI {callRatio.toFixed(0)}%</span>
            <span className="text-zinc-500 font-normal font-sans">选中 strike 筹码比</span>
            <span className="text-rose-400">{putRatio.toFixed(0)}% PUT OI</span>
          </div>
          <div className="h-1.5 w-full bg-zinc-900 rounded-full flex overflow-hidden">
            <div style={{ width: `${callRatio}%` }} className="bg-emerald-500 h-full" />
            <div style={{ width: `${putRatio}%` }} className="bg-rose-500 h-full" />
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-3 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            希腊参数面板 (Options Greeks)
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Delta (δ)', selectedLeg?.delta ?? null, '方向敏感度'],
              ['Gamma (γ)', selectedLeg?.gamma ?? null, '速度敏感度'],
              ['Theta (θ)', selectedLeg?.theta ?? null, '时间蚕食'],
              ['Vega (ν)', selectedLeg?.vega ?? null, '波动率敏感'],
            ].map(([label, value, hint]) => (
              <div key={String(label)} className="bg-zinc-950/40 rounded-lg p-2 border border-zinc-800 flex flex-col">
                <span className="text-[9px] text-zinc-500 font-semibold">{label} {hint}</span>
                <span className="font-mono font-bold text-zinc-200 mt-0.5">
                  {typeof value === 'number' ? formatGreek(value) : '--'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0c0c0e] border border-zinc-800 rounded-lg p-4 shadow-2xl flex flex-col gap-5 select-none min-h-[360px]">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5 uppercase tracking-wide">
              <Compass className="w-4 h-4 text-emerald-400" />
              Option Chips Heatmap / 期权筹码分布分析
            </h3>
            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-900/40 px-2 py-0.5 rounded font-bold">
              real volume/OI
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            使用当前公开期权链的成交量和未平仓量，不生成模拟盘口。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-emerald-950/10 border border-emerald-900/20 p-3 rounded-lg flex items-center gap-3">
            <Zap className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-[10px] text-zinc-500 font-medium">总成交量</div>
              <div className="text-base font-bold text-white font-mono">
                {quoteTicket ? formatScaledNumber(quoteTicket.distribution.totalVolume, scaleMode) : '--'}
              </div>
            </div>
          </div>
          <div className="bg-amber-950/10 border border-amber-900/20 p-3 rounded-lg flex items-center gap-3">
            <Award className="w-4 h-4 text-amber-400" />
            <div>
              <div className="text-[10px] text-zinc-500 font-medium">选中行权价</div>
              <div className="text-base font-bold text-amber-400 font-mono">
                {quoteTicket ? formatPrice(quoteTicket.strike) : '--'}
              </div>
            </div>
          </div>
          <div className="bg-rose-950/10 border border-rose-900/20 p-3 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            <div>
              <div className="text-[10px] text-zinc-500 font-medium">总未平仓</div>
              <div className="text-base font-bold text-white font-mono">
                {quoteTicket ? formatScaledNumber(quoteTicket.distribution.totalOpenInterest, scaleMode) : '--'}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center text-[10px] font-bold">
            <span className="text-emerald-400 uppercase">Calls {callRatio.toFixed(1)}%</span>
            <span className="text-zinc-500 font-normal">selected strike Call/Put OI ratio</span>
            <span className="text-rose-400 uppercase">Puts {putRatio.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full bg-zinc-900 rounded-full flex overflow-hidden">
            <div style={{ width: `${callRatio}%` }} className="bg-emerald-500 h-full" />
            <div style={{ width: `${putRatio}%` }} className="bg-rose-500 h-full" />
          </div>
        </div>

        <div className="bg-zinc-950/40 rounded-lg border border-zinc-800 p-3 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-zinc-300 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              Hot-Zone Flow Distribution
            </span>
            <span className="text-[9px] text-zinc-500 font-mono">X: Strike | Y: Volume Share</span>
          </div>
          <div className="space-y-2">
            {topDistributionRows.length > 0 ? topDistributionRows.map((item) => (
              <div key={item.strike} className="grid grid-cols-[64px_1fr_48px] items-center gap-2 text-[10px]">
                <div className="text-zinc-300 font-black">{formatPrice(item.strike)}</div>
                <div className="h-3 bg-zinc-900 relative overflow-hidden rounded-sm">
                  <div
                    className={item.dominantSide === 'put' ? 'h-full bg-fuchsia-500/70' : item.dominantSide === 'call' ? 'h-full bg-cyan-400/70' : 'h-full bg-zinc-500/70'}
                    style={{ width: `${Math.max(3, item.volumeSharePct)}%` }}
                  />
                </div>
                <div className="text-right text-zinc-400">{item.volumeSharePct.toFixed(1)}%</div>
              </div>
            )) : (
              <div className="border border-dashed border-zinc-800 bg-black p-3 text-[11px] text-zinc-500">
                无选中合约时不显示分布，避免把模型量能误认为真实盘口。
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
