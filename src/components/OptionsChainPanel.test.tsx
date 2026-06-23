import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import OptionsChainPanel from './OptionsChainPanel';
import type { LiveExpiry, LiveOptionChainRow } from '../types';

const expiries: LiveExpiry[] = [
  { date: '2028-01-21', days: 578, label: '2028.01.21 (578天)' },
];

const chain: LiveOptionChainRow[] = [
  {
    type: 'call',
    expiry: '2028-01-21',
    strike: 80,
    bid: 0,
    ask: 0,
    mark: 12.5,
    volume: 0,
    openInterest: 300,
    iv: 72,
    quoteTradable: false,
    source: 'public_mock_options_snapshot_analysis_only',
  },
];

const html = renderToStaticMarkup(
  <OptionsChainPanel
    currentStockPrice={76.71}
    daysToExpiry={578}
    r={4.5}
    activeSymbol="DRAM"
    tickerIV={72}
    legs={[]}
    onUpdateLegs={() => undefined}
    strategyName="测试"
    setStrategyName={() => undefined}
    liveChain={chain}
    liveExpiries={expiries}
  />,
);

assert.match(html, /2028\.01\.21 \(578天\)/);
assert.match(html, /OPTION QUOTE TICKET/);
assert.match(html, /LIQUIDITY \/ 筹码分布/);
assert.match(html, /不生成额外模拟盘口/);
assert.match(html, /\$12\.50/);
assert.match(html, /72\.0%/);
assert.match(html, /cursor-not-allowed/);

console.log('OptionsChainPanel render tests passed');
