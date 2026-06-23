/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OptionLeg, Strategy } from '../types';

export const getStrategyTemplates = (currentPrice: number, baseIV: number): Strategy[] => {
  // Round to nearest integer or appropriate increment
  const S = Math.round(currentPrice);
  const step = currentPrice > 1000 ? 50 : currentPrice > 200 ? 10 : 5;
  const safeStrike = (value: number) => Math.max(step, Math.round(value / step) * step);

  return [
    {
      id: 'single_call',
      name: '买入看涨期权 (Long Call)',
      legs: [
        {
          id: 'lc_1',
          type: 'call',
          side: 'buy',
          strike: safeStrike(S),
          expiryDays: 30,
          quantity: 1,
          iv: baseIV,
          premium: Number((currentPrice * 0.04).toFixed(2)),
          isCustomPremium: false
        }
      ]
    },
    {
      id: 'bull_call_spread',
      name: '牛市看涨价差 (Bull Call Spread)',
      legs: [
        {
          id: 'bcs_1',
          type: 'call',
          side: 'buy',
          strike: safeStrike(S - step),
          expiryDays: 30,
          quantity: 1,
          iv: baseIV,
          premium: Number((currentPrice * 0.06).toFixed(2)),
          isCustomPremium: false
        },
        {
          id: 'bcs_2',
          type: 'call',
          side: 'sell',
          strike: safeStrike(S + step),
          expiryDays: 30,
          quantity: 1,
          iv: baseIV,
          premium: Number((currentPrice * 0.02).toFixed(2)),
          isCustomPremium: false
        }
      ]
    },
    {
      id: 'bear_put_spread',
      name: '熊市看跌价差 (Bear Put Spread)',
      legs: [
        {
          id: 'bps_1',
          type: 'put',
          side: 'buy',
          strike: safeStrike(S + step),
          expiryDays: 30,
          quantity: 1,
          iv: baseIV + 2, // skew
          premium: Number((currentPrice * 0.06).toFixed(2)),
          isCustomPremium: false
        },
        {
          id: 'bps_2',
          type: 'put',
          side: 'sell',
          strike: safeStrike(S - step),
          expiryDays: 30,
          quantity: 1,
          iv: baseIV + 4,
          premium: Number((currentPrice * 0.02).toFixed(2)),
          isCustomPremium: false
        }
      ]
    },
    {
      id: 'iron_condor',
      name: '铁鹰宽跨式套利 (Iron Condor)',
      legs: [
        {
          id: 'ic_1',
          type: 'put',
          side: 'buy',
          strike: safeStrike(S - step * 2),
          expiryDays: 30,
          quantity: 1,
          iv: baseIV + 5,
          premium: Number((currentPrice * 0.01).toFixed(2)),
          isCustomPremium: false
        },
        {
          id: 'ic_2',
          type: 'put',
          side: 'sell',
          strike: safeStrike(S - step),
          expiryDays: 30,
          quantity: 1,
          iv: baseIV + 3,
          premium: Number((currentPrice * 0.025).toFixed(2)),
          isCustomPremium: false
        },
        {
          id: 'ic_3',
          type: 'call',
          side: 'sell',
          strike: safeStrike(S + step),
          expiryDays: 30,
          quantity: 1,
          iv: baseIV,
          premium: Number((currentPrice * 0.025).toFixed(2)),
          isCustomPremium: false
        },
        {
          id: 'ic_4',
          type: 'call',
          side: 'buy',
          strike: safeStrike(S + step * 2),
          expiryDays: 30,
          quantity: 1,
          iv: baseIV,
          premium: Number((currentPrice * 0.01).toFixed(2)),
          isCustomPremium: false
        }
      ]
    },
    {
      id: 'long_straddle',
      name: '跨式多头波动套利 (Long Straddle)',
      legs: [
        {
          id: 'ls_1',
          type: 'call',
          side: 'buy',
          strike: safeStrike(S),
          expiryDays: 30,
          quantity: 1,
          iv: baseIV,
          premium: Number((currentPrice * 0.045).toFixed(2)),
          isCustomPremium: false
        },
        {
          id: 'ls_2',
          type: 'put',
          side: 'buy',
          strike: safeStrike(S),
          expiryDays: 30,
          quantity: 1,
          iv: baseIV + 2,
          premium: Number((currentPrice * 0.048).toFixed(2)),
          isCustomPremium: false
        }
      ]
    },
    {
      id: 'long_put_crash',
      name: '黑天鹅尾部对冲 (Black Swan Long Put)',
      legs: [
        {
          id: 'bs_put_1',
          type: 'put',
          side: 'buy',
          strike: safeStrike(S - step * 4),
          expiryDays: 60,
          quantity: 1,
          iv: baseIV + 8,
          premium: Number((currentPrice * 0.018).toFixed(2)),
          isCustomPremium: false
        }
      ]
    },
    {
      id: 'covered_call_overlay',
      name: '持保备兑收益 (Covered Call Overlay)',
      legs: [
        {
          id: 'cc_1',
          type: 'call',
          side: 'sell',
          strike: safeStrike(S + step * 2),
          expiryDays: 30,
          quantity: 1,
          iv: baseIV,
          premium: Number((currentPrice * 0.022).toFixed(2)),
          isCustomPremium: false
        }
      ]
    },
    {
      id: 'protective_collar',
      name: '持仓保护领口 (Protective Collar)',
      legs: [
        {
          id: 'pc_1',
          type: 'put',
          side: 'buy',
          strike: safeStrike(S - step * 2),
          expiryDays: 45,
          quantity: 1,
          iv: baseIV + 5,
          premium: Number((currentPrice * 0.025).toFixed(2)),
          isCustomPremium: false
        },
        {
          id: 'pc_2',
          type: 'call',
          side: 'sell',
          strike: safeStrike(S + step * 2),
          expiryDays: 45,
          quantity: 1,
          iv: baseIV,
          premium: Number((currentPrice * 0.022).toFixed(2)),
          isCustomPremium: false
        }
      ]
    }
  ];
};
