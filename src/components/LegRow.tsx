/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { OptionLeg, PositionSide, OptionType, LiveExpiry } from '../types';
import { buildExpiryChoices, selectedExpiryValue } from '../lib/expiryChoices';
import { Trash2 } from 'lucide-react';
import { parseEditableNumberInput, resolveEditableNumberBlurValue } from '../lib/editableNumber';

interface LegRowProps {
  key?: string | number;
  leg: OptionLeg;
  tickerPrice: number;
  liveExpiries?: LiveExpiry[];
  onUpdate: (updatedLeg: OptionLeg) => void;
  onDelete: (id: string) => void;
}

export default function LegRow({ leg, tickerPrice, liveExpiries, onUpdate, onDelete }: LegRowProps) {
  const S = Math.round(tickerPrice);
  const expiryChoices = buildExpiryChoices(liveExpiries, leg.expiryDays);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [activeDraftField, setActiveDraftField] = useState<string | null>(null);

  useEffect(() => {
    setDraftValues((current) => {
      const next = { ...current };
      (['strike', 'quantity', 'iv', 'premium'] as const).forEach((field) => {
        if (activeDraftField === field) return;
        next[field] = String(leg[field]);
      });
      return next;
    });
  }, [activeDraftField, leg.strike, leg.quantity, leg.iv, leg.premium]);

  // Strike step size based on price
  const strikeStep = tickerPrice > 1000 ? 50 : tickerPrice > 200 ? 10 : tickerPrice > 50 ? 5 : 1;

  const handleSideChange = (side: PositionSide) => {
    onUpdate({ ...leg, side });
  };

  const handleTypeChange = (type: OptionType) => {
    onUpdate({ ...leg, type });
  };

  const handleNumChange = (field: keyof OptionLeg, val: number) => {
    if (isNaN(val) || val < 0.01) return;
    setDraftValues((current) => ({ ...current, [field]: String(val) }));
    onUpdate({ ...leg, [field]: val, ...(field === 'premium' ? { isCustomPremium: true } : {}) });
  };

  const handleEditableNumChange = (field: keyof OptionLeg, rawValue: string, minValue = 0.01, integer = false) => {
    setDraftValues((current) => ({ ...current, [field]: rawValue }));
    const parsed = parseEditableNumberInput(rawValue, minValue);
    if (!parsed.shouldCommit || parsed.parsedValue === undefined) return;
    const nextValue = integer ? Math.floor(parsed.parsedValue) : parsed.parsedValue;
    if (nextValue < minValue) return;
    onUpdate({ ...leg, [field]: nextValue, ...(field === 'premium' ? { isCustomPremium: true } : {}) });
  };

  const handleEditableNumBlur = (field: keyof OptionLeg) => {
    setDraftValues((current) => ({
      ...current,
      [field]: resolveEditableNumberBlurValue(current[field] ?? String(leg[field]), Number(leg[field])),
    }));
    setActiveDraftField(null);
  };

  const togglePremiumAuto = () => {
    onUpdate({ ...leg, isCustomPremium: !leg.isCustomPremium });
  };

  const lockPremiumToFill = () => {
    if (!leg.isCustomPremium) {
      onUpdate({ ...leg, isCustomPremium: true });
    }
  };

  return (
    <div className="bg-[#030304] border border-[#ff9f1c]/20 rounded-none p-3 sm:p-4 flex flex-wrap items-center justify-between gap-4 transition hover:border-[#ff9f1c]/50">
      {/* 1. Side & Type Selectors */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {/* Buy/Sell Side */}
        <div className="flex bg-black rounded-none p-0.5 border border-gray-800 text-xs">
          <button
            onClick={() => handleSideChange('buy')}
            className={`px-3 py-1 rounded-none transition font-black font-mono tracking-wider ${leg.side === 'buy' ? 'bg-[#00ff33]/15 text-[#00ff33] border border-[#00ff33]/30' : 'text-gray-400 hover:text-white'}`}
          >
            买入 BUY
          </button>
          <button
            onClick={() => handleSideChange('sell')}
            className={`px-3 py-1 rounded-none transition font-black font-mono tracking-wider ${leg.side === 'sell' ? 'bg-[#ff3333]/15 text-[#ff3333] border border-[#ff3333]/30' : 'text-gray-400 hover:text-white'}`}
          >
            卖出 SELL
          </button>
        </div>

        {/* Option Call/Put Type */}
        <div className="flex bg-black rounded-none p-0.5 border border-gray-800 text-xs">
          <button
            onClick={() => handleTypeChange('call')}
            className={`px-3 py-1 rounded-none transition font-black font-mono tracking-wider ${leg.type === 'call' ? 'bg-[#00e5ff]/15 text-[#00e5ff] border border-[#00e5ff]/40' : 'text-gray-400 hover:text-white'}`}
          >
            看涨 CALL
          </button>
          <button
            onClick={() => handleTypeChange('put')}
            className={`px-3 py-1 rounded-none transition font-black font-mono tracking-wider ${leg.type === 'put' ? 'bg-[#ff33ff]/15 text-[#ff33ff] border border-[#ff33ff]/40' : 'text-gray-400 hover:text-white'}`}
          >
            看跌 PUT
          </button>
        </div>
      </div>

      {/* 2. Numeric inputs (Strike, Quantity, Expiry, IV) */}
      <div className="flex-1 flex flex-wrap items-center gap-3.5 min-w-[280px]">
        {/* Strike Input */}
        <div className="flex-1 min-w-[100px] max-w-[130px]">
          <label className="block text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">Strike (行权价)</label>
          <div className="relative flex items-center bg-black border border-gray-800 overflow-hidden h-[30px] rounded-none">
            <button
              onClick={() => handleNumChange('strike', Math.max(1, leg.strike - strikeStep))}
              className="text-gray-400 hover:text-white border-r border-gray-800 font-bold focus:outline-none hover:bg-white/5 h-full w-7 flex items-center justify-center shrink-0"
            >
              -
            </button>
            <input
              type="number"
              value={draftValues.strike ?? String(leg.strike)}
              onFocus={() => setActiveDraftField('strike')}
              onChange={(e) => handleEditableNumChange('strike', e.target.value)}
              onBlur={() => handleEditableNumBlur('strike')}
              className="w-full bg-transparent text-center text-sm text-[#ff9f1c] font-bold font-mono focus:outline-none py-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => handleNumChange('strike', leg.strike + strikeStep)}
              className="text-gray-400 hover:text-white border-l border-gray-800 font-bold focus:outline-none hover:bg-white/5 h-full w-7 flex items-center justify-center shrink-0"
            >
              +
            </button>
          </div>
        </div>

        {/* Quantity Contracts */}
        <div className="flex-1 min-w-[100px] max-w-[130px]">
          <label className="block text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">Contracts (手数)</label>
          <div className="relative flex items-center bg-black border border-gray-800 overflow-hidden h-[30px] rounded-none">
            <button
              onClick={() => handleNumChange('quantity', Math.max(1, leg.quantity - 1))}
              className="text-gray-400 hover:text-white border-r border-gray-800 font-bold focus:outline-none hover:bg-white/5 h-full w-7 flex items-center justify-center shrink-0"
            >
              -
            </button>
            <input
              type="number"
              min="1"
              value={draftValues.quantity ?? String(leg.quantity)}
              onFocus={() => setActiveDraftField('quantity')}
              onChange={(e) => handleEditableNumChange('quantity', e.target.value, 1, true)}
              onBlur={() => handleEditableNumBlur('quantity')}
              className="w-full bg-transparent text-center text-sm text-[#ff9f1c] font-bold font-mono focus:outline-none py-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => handleNumChange('quantity', leg.quantity + 1)}
              className="text-gray-400 hover:text-white border-l border-gray-800 font-bold focus:outline-none hover:bg-white/5 h-full w-7 flex items-center justify-center shrink-0"
            >
              +
            </button>
          </div>
        </div>

        {/* Expiration Days Dropdown aligned with Real Dates */}
        <div className="flex-1 min-w-[125px] max-w-[155px]">
          <label className="block text-[10px] text-gray-400 font-mono mb-1 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">Expiry (行权时间)</label>
          <div className="relative flex items-center bg-black border border-gray-800 overflow-hidden py-1 px-1 h-[30px] rounded-none">
            <select
              value={selectedExpiryValue(expiryChoices, leg.expiryDays)}
              onChange={(e) => {
                const val = e.target.value;
                if (val !== 'custom') {
                  const matched = expiryChoices.find(p => p.date === val);
                  if (matched) {
                    handleNumChange('expiryDays', matched.days);
                  }
                }
              }}
              className="w-full bg-transparent text-center text-xs text-[#ff9f1c] font-black font-mono focus:outline-none cursor-pointer appearance-none px-1"
            >
              {expiryChoices.map((preset) => (
                <option key={preset.date} value={preset.date} className="bg-[#101014] text-[#ff9f1c]">
                  {preset.isCustom ? preset.label : `${preset.date.replace(/-/g, '.')} (${preset.days}天)`}
                </option>
              ))}
            </select>
          </div>
          <span className="text-[10px] text-center block mt-1 font-mono text-sky-400 font-bold whitespace-nowrap overflow-hidden text-ellipsis">
            距行权: <strong className="text-[#ff9f1c] font-black">{leg.expiryDays}</strong> 天
          </span>
        </div>

        {/* Implied Volatility (IV) */}
        <div className="flex-1 min-w-[100px] max-w-[130px]">
          <label className="block text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">IV % (隐含波动率)</label>
          <div className="relative flex items-center bg-black border border-gray-800 overflow-hidden h-[30px] rounded-none">
            <button
              onClick={() => handleNumChange('iv', Math.max(5, leg.iv - 5))}
              className="text-gray-400 hover:text-white border-r border-gray-800 focus:outline-none text-[10px] font-bold hover:bg-white/5 h-full w-8 flex items-center justify-center shrink-0"
            >
              -5
            </button>
            <input
              type="number"
              min="1"
              max="300"
              value={draftValues.iv ?? String(leg.iv)}
              onFocus={() => setActiveDraftField('iv')}
              onChange={(e) => handleEditableNumChange('iv', e.target.value, 1)}
              onBlur={() => handleEditableNumBlur('iv')}
              className="w-full bg-transparent text-center text-sm text-[#ff9f1c] font-bold font-mono focus:outline-none py-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => handleNumChange('iv', Math.min(300, leg.iv + 5))}
              className="text-gray-400 hover:text-white border-l border-gray-800 focus:outline-none text-[10px] font-bold hover:bg-white/5 h-full w-8 flex items-center justify-center shrink-0"
            >
              +5
            </button>
          </div>
        </div>
      </div>

      {/* 3. Option Premium / Cost & Delete */}
      <div className="flex items-center gap-3 bg-black p-2 rounded-none border border-gray-800 justify-between sm:justify-end min-w-[245px] font-mono sm:ml-auto">
        <div className="text-right min-w-[178px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] text-gray-500 font-black uppercase">权利金 / 成交价 Premium</span>
            <button
              onClick={togglePremiumAuto}
              className={`text-[9px] font-black px-1.5 py-0.5 rounded-none transition ${!leg.isCustomPremium ? 'bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30' : 'bg-[#ff9f1c]/10 text-[#ff9f1c] border border-[#ff9f1c]/30'}`}
              title={!leg.isCustomPremium ? '当前随模型自动重算；点击切到成交价锁定' : '当前使用手动成交价；点击回到模型自动价'}
            >
              {!leg.isCustomPremium ? '模型价 AUTO' : '成交价 LOCK'}
            </button>
          </div>

          <div className="flex items-center gap-1.5 justify-end mt-1">
            <span className="text-gray-400 font-mono text-xs">$</span>
            <input
              type="number"
              step="0.05"
              min="0.01"
              value={draftValues.premium ?? String(leg.premium)}
              onFocus={() => {
                setActiveDraftField('premium');
                lockPremiumToFill();
              }}
              onChange={(e) => handleEditableNumChange('premium', e.target.value)}
              onBlur={() => handleEditableNumBlur('premium')}
              className={`bg-black font-mono w-24 text-right text-xs py-1 px-1.5 rounded-none focus:outline-none font-bold border ${!leg.isCustomPremium ? 'text-gray-300 border-gray-850 focus:border-[#00e5ff]/50' : 'text-[#ff9f1c] border-[#ff9f1c]/30 focus:border-[#ff9f1c]'}`}
              title="可直接输入真实成交权利金；输入后自动锁定为 Fill Lock，不再随模型刷新覆盖"
            />
            <span className="text-gray-400 font-mono text-[10px]">× 100 股</span>
          </div>
          <div className="flex items-center justify-end gap-1 mt-1">
            <button
              onClick={lockPremiumToFill}
              className={`px-1.5 py-0.5 border text-[8px] font-black ${leg.isCustomPremium ? 'border-[#ff9f1c]/30 text-[#ff9f1c] bg-[#ff9f1c]/10' : 'border-gray-850 text-gray-500 hover:text-white'}`}
              title="锁定当前输入为实际成交权利金"
            >
              锁成交价
            </button>
            <span className={`text-[8.5px] font-bold ${leg.isCustomPremium ? 'text-[#ff9f1c]' : 'text-gray-600'}`}>
              {leg.isCustomPremium ? '按真实成交价计算 PnL' : '默认模型价，可修改'}
            </span>
          </div>
        </div>

        {/* Delete Leg */}
        <button
          onClick={() => onDelete(leg.id)}
          className="p-2 text-gray-400 hover:text-[#ff3333] rounded-none bg-black border border-gray-800 hover:bg-[#ff3333]/15 transition"
          title="Remove Contract Leg"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
