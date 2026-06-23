/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { OptionLeg, TradeLog, ActivePosition } from '../types';
import { calculateLegPayoff, calculateLegValueAndPnL } from '../lib/optionsMath';
import {
  Play, Pause, ArrowRightLeft, DollarSign, Wallet, ShieldAlert,
  TrendingUp, Clock, CheckCircle2, AlertCircle, ShoppingCart, Loader2
} from 'lucide-react';

interface AccountLedgerProps {
  activeLegs: OptionLeg[];
  activeSymbol: string;
  tickerPrice: number;
  r: number;
  strategyName: string;
}

export default function AccountLedger({ activeLegs, activeSymbol, tickerPrice, r, strategyName }: AccountLedgerProps) {
  // Cash balances (persisted in localStorage or session state)
  const [cashBalance, setCashBalance] = useState<number>(() => {
    const saved = localStorage.getItem('titan_cash_balance');
    return saved ? parseFloat(saved) : 100000;
  });

  const [realizedPnl, setRealizedPnl] = useState<number>(() => {
    const saved = localStorage.getItem('titan_realized_pnl');
    return saved ? parseFloat(saved) : 0;
  });

  // Trade logs & open positions
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>(() => {
    const saved = localStorage.getItem('titan_trade_logs');
    return saved ? JSON.parse(saved) : [];
  });

  const [openPositions, setOpenPositions] = useState<ActivePosition[]>(() => {
    const saved = localStorage.getItem('titan_open_positions');
    return saved ? JSON.parse(saved) : [];
  });

  // Ordering screen state animation
  const [orderState, setOrderState] = useState<'IDLE' | 'ROUTING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [routingLogs, setRoutingLogs] = useState<string[]>([]);
  const [routingProgress, setRoutingProgress] = useState<number>(0);

  // Auto-ticking stock price random walk to simulate a live market
  const [isLiveStreaming, setIsLiveStreaming] = useState<boolean>(false);
  const [simulatedOffset, setSimulatedOffset] = useState<number>(0);

  // Synchronize storage
  useEffect(() => {
    localStorage.setItem('titan_cash_balance', cashBalance.toString());
    localStorage.setItem('titan_realized_pnl', realizedPnl.toString());
    localStorage.setItem('titan_trade_logs', JSON.stringify(tradeLogs));
    localStorage.setItem('titan_open_positions', JSON.stringify(openPositions));
  }, [cashBalance, realizedPnl, tradeLogs, openPositions]);

  // Handle random walk market simulation of stock price
  useEffect(() => {
    if (!isLiveStreaming) return;
    const interval = setInterval(() => {
      setSimulatedOffset(prev => {
        const delta = (Math.random() - 0.5) * (tickerPrice * 0.003); // +/- 0.15% shift
        return prev + delta;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [isLiveStreaming, tickerPrice]);

  const currentSimPrice = tickerPrice + simulatedOffset;
  const asOptionLegs = (legs: ActivePosition['legs']): OptionLeg[] => legs.filter((leg): leg is OptionLeg => leg.kind !== 'stock');

  // Compute live unrealized P&L for open positions based on currentSimPrice
  let totalUnrealizedPnl = 0;
  openPositions.forEach(pos => {
    let entryCostValue = pos.entryTotalVal; // net expense
    let curMarketValue = 0;

    // Calculate current BS valuation of open positions
    asOptionLegs(pos.legs).forEach(leg => {
      const mult = leg.side === 'buy' ? 1 : -1;
      // Evaluate leg under simulate price
      // Assume 1 day has passed for simulation decay
      const state = calculateLegValueAndPnL(leg, currentSimPrice, Math.max(0.1, leg.expiryDays - 1), r);
      curMarketValue += state.value * mult * leg.quantity * 100;
    });

    totalUnrealizedPnl += (curMarketValue - entryCostValue);
  });

  // Calculate options margins
  // In options, writing naked calls/puts requires margin.
  // Standard approximation: Margin = sum of short contract values or custom risk margins
  let currentMarginHeld = 0;
  openPositions.forEach(pos => {
    asOptionLegs(pos.legs).forEach(leg => {
      if (leg.side === 'sell') {
        // Simple mock margin holding ($1000 per naked option)
        currentMarginHeld += leg.quantity * 1300;
      }
    });

    // Check if current activeLegs in editor has shorts to forecast execution margin requirement
  });

  const activeEditorMarginReq = activeLegs.reduce((sum, leg) => {
    return sum + (leg.side === 'sell' ? leg.quantity * 1300 : 0);
  }, 0);

  const activeEditorTotalPremium = activeLegs.reduce((sum, leg) => {
    const factor = leg.side === 'buy' ? 1 : -1;
    return sum + (leg.premium * factor * leg.quantity * 100);
  }, 0);

  // Trigger executing order simulated routing animation
  const handleExecuteTrade = () => {
    if (activeLegs.length === 0) return;

    // Check buying power limits
    const totalRequiredFunds = activeEditorTotalPremium > 0 ? activeEditorTotalPremium : 0;
    const requiredMargin = activeEditorMarginReq;

    if (cashBalance < totalRequiredFunds) {
      alert('持仓资金不足：本次期权开仓需要权利金 $' + totalRequiredFunds.toFixed(2) + '，目前纸面可用资金量不够。');
      return;
    }

    setOrderState('ROUTING');
    setRoutingLogs([]);
    setRoutingProgress(0);

    const logs = [
      `[PUBLIC MOCK] 正在记录「${strategyName}」纸面组合，不连接任何真实服务。`,
      `[CHECK] 本地检查保证金占用 $${requiredMargin}，纸面权利金 $${activeEditorTotalPremium.toFixed(2)}。`,
      `[SIMULATION] 使用公开 mock BBO 和本地 Black-Scholes 估算纸面成交。`,
      `[SIMULATION] 不发送真实订单，不做真实路由，不写入任何私有账本。`,
      `[SUCCESS] 纸面模拟成交已写入浏览器 localStorage。`
    ];

    let logIndex = 0;
    const logInterval = setInterval(() => {
      if (logIndex < logs.length) {
        setRoutingLogs(prev => [...prev, logs[logIndex]]);
        setRoutingProgress(Math.floor(((logIndex + 1) / logs.length) * 100));
        logIndex++;
      } else {
        clearInterval(logInterval);
        setTimeout(() => {
          // Finalize trade execution
          // 1. Deduct cost from cash
          setCashBalance(prev => prev - activeEditorTotalPremium);

          // 2. Log in trades history
          const activeLegsCopy = JSON.parse(JSON.stringify(activeLegs)) as OptionLeg[];
          const legSummaries = activeLegsCopy.map(leg =>
            `${leg.side.toUpperCase() === 'BUY' ? '买开' : '卖开'} ${leg.quantity}手 ${activeSymbol} $${leg.strike} ${leg.type.toUpperCase()} (IV: ${leg.iv}%)`
          );

          const newLog: TradeLog = {
            id: 'TX_' + Date.now().toString().slice(-6),
            symbol: activeSymbol,
            timestamp: new Date().toLocaleTimeString(),
            strategyName,
            action: `${activeEditorTotalPremium > 0 ? '净支付权利金开仓' : '净收取权利金开仓'} (${strategyName})`,
            legs: legSummaries,
            totalPremium: activeEditorTotalPremium,
            status: 'EXECUTED',
            margin: activeEditorMarginReq
          };
          setTradeLogs(prev => [newLog, ...prev]);

          // 3. Add to open positions
          const newPosition: ActivePosition = {
            id: 'POS_' + Date.now().toString().slice(-6),
            symbol: activeSymbol,
            strategyName,
            legs: activeLegsCopy,
            entryStockPrice: tickerPrice,
            currentStockPrice: tickerPrice,
            entryTotalVal: activeEditorTotalPremium,
            currentTotalVal: activeEditorTotalPremium,
            openTime: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString().slice(0, 5)
          };
          setOpenPositions(prev => [newPosition, ...prev]);

          setOrderState('SUCCESS');
        }, 500);
      }
    }, 450);
  };

  // Close open position
  const handleClosePosition = (posId: string) => {
    const pos = openPositions.find(p => p.id === posId);
    if (!pos) return;

    // Simulate closing options: we do the opposite action.
    // Buying legs are sold, Selling legs are bought back.
    // Calculate final market price based on current BS of simulating price
    let closingValue = 0;
    asOptionLegs(pos.legs).forEach(leg => {
      const mult = leg.side === 'buy' ? 1 : -1;
      const state = calculateLegValueAndPnL(leg, currentSimPrice, Math.max(0.1, leg.expiryDays - 1), r);
      closingValue += state.value * mult * leg.quantity * 100;
    });

    // PnL generated = closingValue - entryTotalVal
    const profit = closingValue - pos.entryTotalVal;

    // Adjust balances
    setCashBalance(prev => prev + closingValue);
    setRealizedPnl(prev => prev + profit);

    // Create closing trade log
    const legSummaries = asOptionLegs(pos.legs).map(leg =>
      `${leg.side === 'buy' ? '卖平' : '买平'} ${leg.quantity}手 ${pos.symbol} $${leg.strike} ${leg.type.toUpperCase()}`
    );

    const newLog: TradeLog = {
      id: 'TX_' + Date.now().toString().slice(-6),
      symbol: pos.symbol,
      timestamp: new Date().toLocaleTimeString(),
      strategyName: pos.strategyName + ' (平仓)',
      action: `一键强制平仓离场 (已实现利润 $${profit.toFixed(2)})`,
      legs: legSummaries,
      totalPremium: -closingValue, // Negative means we received money back during close
      status: 'EXECUTED',
      margin: 0
    };

    setTradeLogs(prev => [newLog, ...prev]);
    setOpenPositions(prev => prev.filter(p => p.id !== posId));
  };

  const handleResetSimulator = () => {
    if (confirm('确认重置虚拟账户资产及交易明细？这将会把可用资金归零为十万美金初始值。')) {
      localStorage.removeItem('titan_cash_balance');
      localStorage.removeItem('titan_realized_pnl');
      localStorage.removeItem('titan_trade_logs');
      localStorage.removeItem('titan_open_positions');
      setCashBalance(100000);
      setRealizedPnl(0);
      setTradeLogs([]);
      setOpenPositions([]);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* 1. Account Summary Panel */}
      <div className="bg-[#16161a] border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2.5">
            <h4 className="text-gray-100 font-semibold text-sm flex items-center gap-1.5 font-sans">
              <Wallet className="text-emerald-400 w-4.5 h-4.5" />
              虚拟账户资产分析
            </h4>

            <button
              onClick={handleResetSimulator}
              className="text-[10px] text-gray-500 hover:text-rose-400 border border-gray-800/80 px-2 py-0.5 rounded hover:border-rose-500/20 font-mono transition"
            >
              重置账户
            </button>
          </div>

          <div className="space-y-4">
            {/* Net Liquidation Value */}
            <div>
              <span className="text-xs text-gray-400 font-mono">账户净资产 (Net Liq)</span>
              <div className="text-2xl font-bold font-mono text-gray-100 mt-1 flex items-baseline gap-1">
                <span className="text-gray-400 text-lg">$</span>
                {(cashBalance + totalUnrealizedPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* Balances details */}
            <div className="grid grid-cols-2 gap-3.5 bg-gray-900/60 p-3 rounded-lg border border-gray-800/40">
              <div>
                <span className="text-[10px] text-gray-400 font-mono">可用现金余额</span>
                <p className="text-xs font-semibold font-mono text-gray-200 mt-0.5">${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-mono">持仓保证金占用</span>
                <p className="text-xs font-semibold font-mono text-amber-400 mt-0.5">${currentMarginHeld.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-mono">已实现盈亏 (Realized)</span>
                <p className={`text-xs font-bold font-mono mt-0.5 ${realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-mono">未实现盈亏 (Floating)</span>
                <p className={`text-xs font-bold font-mono mt-0.5 ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Live Simulator price movement controller toggle */}
        <div className="mt-5 border-t border-gray-800/60 pt-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isLiveStreaming ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'} inline-block`} />
              波动行情流仿真
            </span>
            <span className="text-[11px] text-sky-400 font-mono font-semibold mt-0.5">
              ${currentSimPrice.toFixed(2)} {simulatedOffset !== 0 && `(${(simulatedOffset >= 0 ? '+' : '') + simulatedOffset.toFixed(2)})`}
            </span>
          </div>

          <button
            onClick={() => {
              setIsLiveStreaming(!isLiveStreaming);
              if (isLiveStreaming) setSimulatedOffset(0); // reset if stopping
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium font-sans transition ${isLiveStreaming ? 'bg-rose-600/15 text-rose-400 border-rose-500/20' : 'bg-emerald-600/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-600/25'}`}
          >
            {isLiveStreaming ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-rose-400" />
                暂停实况股价
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-emerald-400" />
                启动大盘心跳
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Order Ticket Execution */}
      <div className="bg-[#16161a] border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2.5">
            <h4 className="text-gray-100 font-semibold text-sm flex items-center gap-1.5 font-sans">
              <ShoppingCart className="text-emerald-400 w-4.5 h-4.5" />
              纸面模拟执行终端
            </h4>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-1.5 py-0.5 font-semibold rounded uppercase">
              Paper Trading
            </span>
          </div>

          {orderState === 'IDLE' && (
            <div className="space-y-3.5">
              <div className="bg-gray-900/40 border border-gray-800 p-3 rounded-lg text-xs space-y-2">
                <div className="flex justify-between items-center text-gray-400 font-mono">
                  <span>标的挂钩</span>
                  <span className="text-gray-200 font-bold font-sans">{activeSymbol}</span>
                </div>
                <div className="flex justify-between items-center text-gray-400 font-mono">
                  <span>选择策略组合</span>
                  <span className="text-emerald-400 font-bold">{strategyName}</span>
                </div>
                <div className="flex justify-between items-center text-gray-400 font-mono">
                  <span>持仓腿数量</span>
                  <span className="text-gray-200 font-bold">{activeLegs.length} Legs</span>
                </div>
                <div className="flex justify-between items-center text-gray-400 font-mono">
                  <span>净开仓额度 (Net Premium)</span>
                  <span className={`font-mono font-bold text-sm ${activeEditorTotalPremium >= 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {activeEditorTotalPremium >= 0 ? '借记支付 debit' : '贷记收入 credit'}{' '}
                    ${Math.abs(activeEditorTotalPremium).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-gray-400 font-mono">
                  <span>首期撮合估算保证金</span>
                  <span className="text-gray-200 font-bold">${activeEditorMarginReq}</span>
                </div>
              </div>

              {activeLegs.length === 0 ? (
                <div className="text-center text-xs text-gray-500 bg-gray-900/20 py-8 rounded-lg border border-dashed border-gray-800">
                  右侧编辑器为空，请添加或生成策略。
                </div>
              ) : (
                <div className="text-[11px] text-gray-400 leading-relaxed font-mono flex items-start gap-1.5 bg-gray-900/20 p-2.5 rounded border border-gray-800/40">
                  <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  期权属高风险衍生工具，本版本只写入浏览器本地纸面模拟记录，不连接真实账户、真实行情或真实执行服务。
                </div>
              )}
            </div>
          )}

          {/* Execution Routing Screen */}
          {orderState === 'ROUTING' && (
            <div className="flex flex-col h-full justify-between">
              <div className="space-y-3.5">
                <div className="flex items-center justify-between text-xs font-semibold font-mono text-emerald-400">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    做市商撮合智能路由中...
                  </span>
                  <span>{routingProgress}%</span>
                </div>

                <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${routingProgress}%` }}
                  />
                </div>

                {/* Public mock output logs */}
                <div className="bg-gray-950 p-2.5 rounded border border-gray-800/80 font-mono text-[9px] text-gray-400 h-32 overflow-y-auto space-y-1">
                  {routingLogs.map((log, i) => (
                    <div key={i} className={
                      log?.startsWith('[SUCCESS]') ? 'text-emerald-400' :
                      log?.startsWith('[ROUTING]') ? 'text-sky-400' :
                      log?.startsWith('[MATCHING]') ? 'text-amber-400' : 'text-gray-400'
                    }>
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Order success confirmation screen */}
          {orderState === 'SUCCESS' && (
            <div className="text-center py-6 space-y-3.5">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
              <div>
                <h5 className="text-gray-100 font-semibold text-sm">撮合成交录入成功</h5>
                <p className="text-xs text-gray-400 font-mono mt-0.5">指令编码: OPT_ORD_{Date.now().toString().slice(-6)}</p>
              </div>
              <button
                onClick={() => setOrderState('IDLE')}
                className="bg-[#1e1e24] px-4 py-1.5 rounded text-xs text-gray-300 border border-gray-800 inline-block hover:text-white hover:bg-[#25252d] transition"
              >
                新建持仓执行
              </button>
            </div>
          )}
        </div>

        {orderState === 'IDLE' && activeLegs.length > 0 && (
          <button
            onClick={handleExecuteTrade}
            className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold text-xs py-3 rounded-lg text-white font-sans mt-4 shadow-lg shadow-emerald-950/40 transition hover:scale-[1.01] flex items-center justify-center gap-1.5"
          >
            <ArrowRightLeft className="w-4 h-4" />
            一键发出交易指令 (纸面交易仿真)
          </button>
        )}
      </div>

      {/* 3. Open Positions Ledger list */}
      <div className="bg-[#16161a] border border-gray-800 rounded-xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2.5">
          <h4 className="text-gray-100 font-semibold text-sm flex items-center gap-1.5 font-sans">
            <TrendingUp className="text-emerald-400 w-4.5 h-4.5" />
            当前活动持仓账本 ({openPositions.length})
          </h4>
          <span className="text-[10px] text-gray-500 font-mono">
            {isLiveStreaming ? '行情同步中' : '静态展示'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[220px] space-y-2.5 scrollbar-thin">
          {openPositions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-8 text-center">
              <Clock className="w-8 h-8 text-gray-600 mb-2 animate-pulse" />
              <p className="text-xs text-gray-500">账户无未平仓合约账户记录。</p>
            </div>
          ) : (
            openPositions.map((pos) => {
              // Calculate live fluctuating value and profit for this specific position
              let entryVal = pos.entryTotalVal;
              let currentVal = 0;
              asOptionLegs(pos.legs).forEach(leg => {
                const mult = leg.side === 'buy' ? 1 : -1;
                const state = calculateLegValueAndPnL(leg, currentSimPrice, Math.max(0.1, leg.expiryDays - 1), r);
                currentVal += state.value * mult * leg.quantity * 100;
              });

              const unrealized = currentVal - entryVal;
              const positive = unrealized >= 0;

              return (
                <div key={pos.id} className="bg-gray-900/60 p-3 rounded-lg border border-gray-800/60 flex flex-col gap-2 transition hover:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-100 font-mono">{pos.symbol}</span>
                        <span className="bg-[#1c2438] text-sky-400 text-[9px] font-bold px-1.5 py-0.5 rounded">
                          {pos.strategyName}
                        </span>
                      </div>
                      <span className="text-[8px] text-gray-500 font-mono block mt-0.5">
                        建仓价: ${pos.entryStockPrice.toFixed(2)} | 开仓于: {pos.openTime}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className={`text-xs font-bold font-mono block ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {positive ? '+' : ''}${unrealized.toFixed(2)}
                      </span>
                      <span className="text-[8px] text-gray-500 font-mono inline-block">
                        账面浮动盈亏
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-800/40 pt-2 text-[9px] font-mono label gap-2">
                    <span className="text-gray-400 truncate max-w-[130px]">
                      {pos.legs.length} 条持仓细则
                    </span>

                    <button
                      onClick={() => handleClosePosition(pos.id)}
                      className="px-2.5 py-1 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 rounded-md border border-rose-500/10 transition leading-none text-[8px]"
                    >
                      现价平仓 (Close)
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
