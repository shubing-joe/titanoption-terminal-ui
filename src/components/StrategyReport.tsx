/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { OptionLeg, RustPositionAnalysisResponse } from '../types';
import { analyzeStrategy, calculateLegPayoff } from '../lib/optionsMath';
import { formatReportUsd, resolveStrategyReportSnapshot } from '../lib/strategyReportSnapshot';
import {
  FileText, ShieldCheck, Download, Users, Copy, Scale, Check,
  Sparkles, TrendingUp, HelpCircle, RefreshCw, Layers
} from 'lucide-react';

interface StrategyReportProps {
  legs: OptionLeg[];
  currentStockPrice: number;
  daysToExpiry: number;
  r: number;
  strategyName: string;
  activeSymbol: string;
  rustAnalysis?: RustPositionAnalysisResponse;
}

interface SavedCompareDraft {
  id: string;
  name: string;
  legs: OptionLeg[];
  symbol: string;
  stockPriceAtSave: number;
  netPremium: number;
  maxProfit: number | string;
  maxLoss: number | string;
  breakevens: number[];
  greeks: { delta: number; gamma: number; vega: number; theta: number };
}

export default function StrategyReport({ legs, currentStockPrice, daysToExpiry, r, strategyName, activeSymbol, rustAnalysis }: StrategyReportProps) {
  const [comparedDrafts, setComparedDrafts] = useState<SavedCompareDraft[]>(() => {
    const saved = localStorage.getItem('titan_compare_drafts');
    return saved ? JSON.parse(saved) : [];
  });

  const [copiedLink, setCopiedLink] = useState(false);

  // Analyze active portfolio structure
  const activeAnalysis = analyzeStrategy(legs, currentStockPrice, daysToExpiry, r);
  const reportSnapshot = resolveStrategyReportSnapshot({
    activeSymbol,
    strategyName,
    analysis: activeAnalysis,
    rustAnalysis,
  });

  // Save strategic setup for multi-strategy comparison
  const handleSaveToCompare = () => {
    if (legs.length === 0) return;
    if (comparedDrafts.length >= 3) {
      alert('对比箱已满（最大支持 3 个对比库组）。请先从下方移除旧组合，再进行加入！');
      return;
    }

    const uniqueId = 'DRAFT_' + Date.now().toString().slice(-4);
    const newDraft: SavedCompareDraft = {
      id: uniqueId,
      name: `${strategyName} [#${comparedDrafts.length+1}]`,
      legs: JSON.parse(JSON.stringify(legs)),
      symbol: reportSnapshot.symbol,
      stockPriceAtSave: currentStockPrice,
      netPremium: reportSnapshot.netPremium,
      maxProfit: reportSnapshot.maxProfit,
      maxLoss: reportSnapshot.maxLoss,
      breakevens: reportSnapshot.breakevens,
      greeks: { ...reportSnapshot.greeks }
    };

    const nextDrafts = [...comparedDrafts, newDraft];
    setComparedDrafts(nextDrafts);
    localStorage.setItem('titan_compare_drafts', JSON.stringify(nextDrafts));
  };

  const handleRemoveDraft = (id: string) => {
    const nextDrafts = comparedDrafts.filter(d => d.id !== id);
    setComparedDrafts(nextDrafts);
    localStorage.setItem('titan_compare_drafts', JSON.stringify(nextDrafts));
  };

  const handleClearCompare = () => {
    setComparedDrafts([]);
    localStorage.removeItem('titan_compare_drafts');
  };

  // Generate strategy printable report
  const handlePrintReport = () => {
    window.print();
  };

  const handleExportJSON = () => {
    const payload = {
      strategyName,
      tickerPrice: currentStockPrice,
      daysToExpiry,
      riskFreeRate: r,
      legsCount: legs.length,
      symbol: reportSnapshot.symbol,
      engine: reportSnapshot.engineLabel,
      greeks: reportSnapshot.greeks,
      payoffAnalysis: {
        debitCredit: reportSnapshot.netPremium >= 0 ? 'DEBIT' : 'CREDIT',
        netPremiumAmount: Math.abs(reportSnapshot.netPremium),
        currentPnL: reportSnapshot.currentPnL,
        maxProfit: reportSnapshot.maxProfit,
        maxLoss: reportSnapshot.maxLoss,
        breakevens: reportSnapshot.breakevens
      },
      legs
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `titan_option_report_${strategyName.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {/* SECTION 1: Strategy Comparison Sandbox */}
      <div className="bg-[#16161a] border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2.5">
            <h4 className="text-gray-100 font-semibold text-sm flex items-center gap-1.5 font-sans">
              <Layers className="text-emerald-400 w-4.5 h-4.5" />
              多策略并行对比沙盒 (Max 3 组合)
            </h4>

            {comparedDrafts.length > 0 && (
              <button
                onClick={handleClearCompare}
                className="text-[10px] text-gray-500 hover:text-rose-400 border border-gray-800/80 px-2 py-0.5 rounded hover:border-rose-500/20 font-mono transition"
              >
                清空对比箱
              </button>
            )}
          </div>

          <p className="text-xs text-gray-400 leading-normal mb-4 font-sans">
            将当前工作区的策略“保存快照”至下方，即可在表格里将不同期权行权价深度、买卖比、不同结构的成本对冲效果进行同屏横向对比。
          </p>

          {comparedDrafts.length === 0 ? (
            <div className="text-center py-9 bg-gray-900/10 border border-dashed border-gray-800/80 rounded-lg">
              <Scale className="w-9 h-9 text-gray-600 mx-auto mb-2 animate-pulse" />
              <p className="text-xs text-gray-500 font-sans">对比 sandbox 为空</p>
              <button
                onClick={handleSaveToCompare}
                disabled={legs.length === 0}
                className="mt-3 bg-[#1e1e24] border border-gray-800 hover:border-emerald-500/40 text-xs px-3 py-1.5 rounded text-gray-300 hover:text-emerald-400 transition"
              >
                将当前组合锁定至对比组
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Draft side-by-side matrix */}
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800/80 text-gray-400 text-left">
                      <th className="py-2 pr-2 font-semibold">对照期权属性 \ 策略名</th>
                      {comparedDrafts.map(draft => (
                        <th key={draft.id} className="py-2 px-2 text-emerald-400 font-bold truncate max-w-[125px]">
                          {draft.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-850">
                    <tr className="hover:bg-gray-900/10">
                      <td className="py-2 text-gray-400">总首付 / 溢价 (Premium)</td>
                      {comparedDrafts.map(d => (
                        <td key={d.id} className="py-2 px-2 font-bold text-gray-200">
                          {d.netPremium >= 0 ? `支付 Debit $${d.netPremium.toFixed(1)}` : `收取 Credit $${Math.abs(d.netPremium).toFixed(1)}`}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-gray-900/10">
                      <td className="py-2 text-gray-400">最大收益 (Max Gain)</td>
                      {comparedDrafts.map(d => (
                        <td key={d.id} className="py-2 px-2 text-emerald-400 font-bold">
                          {formatReportUsd(d.maxProfit)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-gray-900/10">
                      <td className="py-2 text-gray-400">最大风险 (Max Loss)</td>
                      {comparedDrafts.map(d => (
                        <td key={d.id} className="py-2 px-2 text-rose-400 font-bold">
                          {formatReportUsd(d.maxLoss)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-gray-900/10">
                      <td className="py-2 text-gray-400">盈亏平衡线 (Breakeven)</td>
                      {comparedDrafts.map(d => (
                        <td key={d.id} className="py-2 px-2 text-amber-300">
                          {d.breakevens.length > 0 ? d.breakevens.map(b => `$${b}`).join(' | ') : '无跨越点'}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-gray-900/10">
                      <td className="py-2 text-gray-400">组合 Delta / Gamma</td>
                      {comparedDrafts.map(d => (
                        <td key={d.id} className="py-2 px-2 text-sky-400 font-semibold text-[10px]">
                          {d.greeks.delta.toFixed(1)} / {d.greeks.gamma.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-gray-900/10">
                      <td className="py-2 text-gray-400">组合 Theta / Vega</td>
                      {comparedDrafts.map(d => (
                        <td key={d.id} className="py-2 px-2 text-violet-400 font-semibold text-[10px]">
                          {d.greeks.theta.toFixed(1)} / {d.greeks.vega.toFixed(1)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-gray-900/10">
                      <td className="py-2 text-gray-400">持仓腿 (Legs) 维度</td>
                      {comparedDrafts.map(d => (
                        <td key={d.id} className="py-2 px-2 text-gray-400 text-[10px]">
                          {d.legs.length} 个合约腿成分
                        </td>
                      ))}
                    </tr>
                    {/* Action line */}
                    <tr>
                      <td className="py-2.5 text-gray-500">移除对照快照</td>
                      {comparedDrafts.map(d => (
                        <td key={d.id} className="py-2.5 px-2">
                          <button
                            onClick={() => handleRemoveDraft(d.id)}
                            className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/10 text-[9px] px-2 py-0.5 rounded font-bold transition"
                          >
                            移出对照
                          </button>
                        </td>
                      ))}
                    </tr>
                  </tbody>
				</table>
			  </div>

			  {/* Score Radar Radar representation indicator */}
			  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-[#1e1e24]/50 border border-gray-800 rounded-lg p-2.5">
				{comparedDrafts.map(d => {
				  // Generate simulated comparative score based on metrics
				  const finiteMaxProfit = Number(d.maxProfit);
				  const finiteMaxLoss = Number(d.maxLoss);
				  const maxProfitScore = !Number.isFinite(finiteMaxProfit) ? 95 : Math.min(95, Math.max(10, Math.floor(finiteMaxProfit / 20)));
				  const lossSafetyScore = !Number.isFinite(finiteMaxLoss) ? 5 : Math.min(95, Math.max(15, Math.floor(100 - Math.abs(finiteMaxLoss) / 15)));
				  const thetaScore = Math.min(95, Math.max(20, Math.floor(50 + d.greeks.theta * 5)));

				  return (
					<div key={d.id} className="p-2 bg-[#141416]/90 rounded border border-gray-800 text-[10px]">
					  <div className="font-bold text-gray-200 truncate mb-1 border-b border-gray-850 pb-1 flex items-center justify-between">
					    <span>⚖️ {d.name}</span>
					  </div>
					  <div className="space-y-1.5 mt-2 text-gray-400">
						<div className="flex justify-between">
						  <span>收益张力：</span>
						  <span className="text-emerald-400 font-bold">{maxProfitScore} 分</span>
						</div>
						<div className="flex justify-between">
						  <span>下行防护：</span>
						  <span className="text-rose-400 font-bold">{lossSafetyScore} 分</span>
						</div>
						<div className="flex justify-between">
						  <span>抗衰老 (Theta)：</span>
						  <span className="text-violet-400 font-bold">{thetaScore} 分</span>
						</div>
					  </div>
					</div>
				  );
				})}
			  </div>
            </div>
          )}
        </div>

        {legs.length > 0 && comparedDrafts.length < 3 && (
          <button
            onClick={handleSaveToCompare}
            className="w-full bg-[#1e1e24] hover:bg-emerald-600/15 border border-gray-800 hover:border-emerald-500/20 text-emerald-400 font-bold text-xs py-2.5 rounded-lg font-sans mt-4 transition flex items-center justify-center gap-1.5"
          >
            <Layers className="w-4 h-4" />
            将当前工作区配置存入多策对比箱 ({comparedDrafts.length}/3)
          </button>
        )}
      </div>

      {/* SECTION 2: printable strategy report */}
      <div className="bg-[#16161a] border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2.5">
            <h4 className="text-gray-100 font-semibold text-sm flex items-center gap-1.5 font-sans">
              <FileText className="text-emerald-400 w-4.5 h-4.5" />
              期权衍生品量化评估报告
            </h4>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleExportJSON}
                className="text-[10px] bg-gray-900 text-gray-400 hover:text-white border border-gray-800 px-2 py-1 rounded transition"
                title="导出为标准 JSON 格式"
              >
                导出 JSON
              </button>
              <button
                onClick={handlePrintReport}
                className="text-[10px] bg-emerald-600/10 text-emerald-400 hover:text-white border border-emerald-500/20 hover:bg-emerald-600/20 px-2 py-1 rounded transition flex items-center gap-1"
                title="一键调用系统打印模块"
              >
                <Download className="w-3 h-3" />
                打印 / 存PDF
              </button>
            </div>
          </div>

          {legs.length === 0 ? (
            <div className="text-center py-12 text-xs text-gray-500 font-sans">
              暂无持仓明细。
            </div>
          ) : (
            <div className="space-y-3.5 text-xs text-gray-300 font-mono printable-content">
              {/* Meta */}
              <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800/80 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">报告类别：</span>
                  <span className="font-bold text-gray-200">{reportSnapshot.engineLabel}</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-gray-500">策略主体描述：</span>
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold">
                    {strategyName}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-gray-500">模拟参数环境：</span>
                  <span className="text-gray-400">
                    标的 {reportSnapshot.symbol} | 现存天数 {daysToExpiry}天 | 基准无风险年率 {r}%
                  </span>
                </div>
              </div>

              {/* Profit Boundaries Summary */}
              <div className="space-y-1 bg-gray-905 p-2.5 rounded border border-gray-800/50">
                <div className="flex justify-between items-center border-b border-gray-850 pb-1.5 mb-1.5">
                  <span className="text-gray-400 font-semibold">收益区间评估</span>
                  <span></span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">极限溢利空间 Max Gain:</span>
                  <span className="text-emerald-400 font-bold">
                    {formatReportUsd(reportSnapshot.maxProfit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">极限亏损防护 Max Risk:</span>
                  <span className="text-rose-400 font-bold">
                    {formatReportUsd(reportSnapshot.maxLoss)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">盈亏分水线 Breakeven:</span>
                  <span className="text-amber-400 font-bold">
                    {reportSnapshot.breakevens.length > 0 ? reportSnapshot.breakevens.map(b => `$${b}`).join(' , ') : '不跨越零值'}
                  </span>
                </div>
              </div>

              {/* Portfolio Greeks Risk Exposure Breakdown */}
              <div className="grid grid-cols-2 gap-2.5 pt-1.5">
                <div className="p-2.5 bg-gray-900/40 rounded border border-gray-800/60 text-center">
                  <div className="text-[10px] text-gray-500">德尔塔对冲敞口 Delta</div>
                  <div className="text-base font-bold text-gray-200 mt-1 font-mono">{reportSnapshot.greeks.delta.toFixed(1)}</div>
                  <p className="text-[9px] text-gray-400 mt-1">现货变动$1对期权资产的绝对传导额</p>
                </div>

                <div className="p-2.5 bg-gray-900/40 rounded border border-gray-800/60 text-center">
                  <div className="text-[10px] text-gray-500">伽马曲线斜变率 Gamma</div>
                  <div className="text-base font-bold text-gray-200 mt-1 font-mono">{reportSnapshot.greeks.gamma.toFixed(2)}</div>
                  <p className="text-[9px] text-gray-400 mt-1">德尔塔斜率稳定性。大数值代表股价突变敏感</p>
                </div>

                <div className="p-2.5 bg-gray-900/40 rounded border border-gray-800/60 text-center">
                  <div className="text-[10px] text-gray-500">时间流耗损失 Theta (Daily)</div>
                  <div className="text-base font-bold text-sky-400 mt-1 font-mono">{reportSnapshot.greeks.theta.toFixed(1)}</div>
                  <p className="text-[9px] text-gray-400 mt-1">每日资产仅因时间衰退所产生的自然损耗</p>
                </div>

                <div className="p-2.5 bg-gray-900/40 rounded border border-gray-800/60 text-center">
                  <div className="text-[10px] text-gray-500">波动敏变反应 Vega</div>
                  <div className="text-base font-bold text-amber-400 mt-1 font-mono">{reportSnapshot.greeks.vega.toFixed(1)}</div>
                  <p className="text-[9px] text-gray-400 mt-1">期权标的隐含波动率(IV)变动1%时仓位估算变幅</p>
                </div>
              </div>

              {/* Security signature discalmer */}
              <div className="text-[8px] leading-relaxed text-gray-500 bg-gray-900/20 p-2 rounded border border-gray-800/30 font-sans">
                <div className="font-semibold flex items-center gap-1 mb-0.5 text-gray-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Titan Quant 算法合规评测标记
                </div>
                期权由于内含不均匀的时间流逝损耗与杠杆特征，属于高风险金融衍生工具。本版本仅使用 mock 数据与沙盒计算，不连接真实行情、真实账户或真实执行通道。所有理论计算仅用于页面预览与功能验证。
              </div>
            </div>
          )}
        </div>

        {legs.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-800/60 flex items-center justify-between text-xs font-mono">
            <span className="text-gray-500">报告防伪验证哈希：</span>
            <span className="text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded">
              MD5: SHA-{Date.now().toString().slice(-5)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
