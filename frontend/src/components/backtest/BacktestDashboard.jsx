import { useState, useEffect, useMemo, useCallback } from 'react';
import { Play, Loader2, ArrowUpRight, ArrowDownRight, Eye, X, Plus, Trash2, Download, Settings2 } from 'lucide-react';
import api from '../../services/api';

const INDICATOR_GROUPS = [
  {
    label: 'Price & Volume',
    options: [
      { key: 'close', label: 'Price (LTP)' },
      { key: 'open', label: 'Open' },
      { key: 'high', label: 'High' },
      { key: 'low', label: 'Low' },
      { key: 'volume', label: 'Volume' }
    ]
  },
  {
    label: 'SMA',
    options: [
      { key: 'sma20', label: 'SMA 20' },
      { key: 'deltaSma20', label: 'Delta SMA 20' },
      { key: 'deltaSqSma20', label: 'Delta Delta SMA 20' },
      { key: 'sma50', label: 'SMA 50' },
      { key: 'deltaSma50', label: 'Delta SMA 50' },
      { key: 'deltaSqSma50', label: 'Delta Delta SMA 50' },
      { key: 'sma100', label: 'SMA 100' },
      { key: 'deltaSma100', label: 'Delta SMA 100' },
      { key: 'deltaSqSma100', label: 'Delta Delta SMA 100' },
      { key: 'sma200', label: 'SMA 200' },
      { key: 'deltaSma200', label: 'Delta SMA 200' },
      { key: 'deltaSqSma200', label: 'Delta Delta SMA 200' }
    ]
  },
  {
    label: 'EMA',
    options: [
      { key: 'ema20', label: 'EMA 20' },
      { key: 'deltaEma20', label: 'Delta EMA 20' },
      { key: 'deltaSqEma20', label: 'Delta Delta EMA 20' },
      { key: 'ema50', label: 'EMA 50' },
      { key: 'deltaEma50', label: 'Delta EMA 50' },
      { key: 'deltaSqEma50', label: 'Delta Delta EMA 50' },
      { key: 'ema100', label: 'EMA 100' },
      { key: 'deltaEma100', label: 'Delta EMA 100' },
      { key: 'deltaSqEma100', label: 'Delta Delta EMA 100' },
      { key: 'ema200', label: 'EMA 200' },
      { key: 'deltaEma200', label: 'Delta EMA 200' },
      { key: 'deltaSqEma200', label: 'Delta Delta EMA 200' }
    ]
  },
  {
    label: 'RSI',
    options: [
      { key: 'rsi14', label: 'RSI 14' },
      { key: 'deltaRsi14', label: 'Delta RSI 14' },
      { key: 'deltaSqRsi14', label: 'Delta Delta RSI 14' }
    ]
  },
  {
    label: 'Bollinger Bands',
    options: [
      { key: 'bbUpper', label: 'BB Upper' },
      { key: 'deltaBbUpper', label: 'Delta BB Upper' },
      { key: 'deltaSqBbUpper', label: 'Delta Delta BB Upper' },
      { key: 'bbMiddle', label: 'BB Mid' },
      { key: 'deltaBbMiddle', label: 'Delta BB Mid' },
      { key: 'deltaSqBbMiddle', label: 'Delta Delta BB Mid' },
      { key: 'bbLower', label: 'BB Lower' },
      { key: 'deltaBbLower', label: 'Delta BB Lower' },
      { key: 'deltaSqBbLower', label: 'Delta Delta BB Lower' }
    ]
  },
  {
    label: 'MACD',
    options: [
      { key: 'macdLine', label: 'MACD Line' },
      { key: 'deltaMACD', label: 'Delta MACD Line' },
      { key: 'deltaSqMacdLine', label: 'Delta Delta MACD Line' },
      { key: 'macdSignal', label: 'MACD Signal' },
      { key: 'deltaMacdSignal', label: 'Delta MACD Signal' },
      { key: 'deltaSqMacdSignal', label: 'Delta Delta MACD Signal' },
      { key: 'macdHist', label: 'MACD Histogram' },
      { key: 'deltaMacdHist', label: 'Delta MACD Histogram' },
      { key: 'deltaSqMacdHist', label: 'Delta Delta MACD Histogram' }
    ]
  },
  {
    label: 'ADX / DI',
    options: [
      { key: 'adx', label: 'ADX' },
      { key: 'deltaADX', label: 'Delta ADX' },
      { key: 'deltaSqADX', label: 'Delta Delta ADX' },
      { key: 'plusDI', label: '+DI' },
      { key: 'deltaPlusDI', label: 'Delta +DI' },
      { key: 'deltaSqPlusDI', label: 'Delta Delta +DI' },
      { key: 'minusDI', label: '-DI' },
      { key: 'deltaMinusDI', label: 'Delta -DI' },
      { key: 'deltaSqMinusDI', label: 'Delta Delta -DI' },
      { key: 'di', label: 'DI (+DI - -DI)' },
      { key: 'deltaDI', label: 'Delta DI' },
      { key: 'deltaSqDI', label: 'Delta Delta DI' }
    ]
  },
  {
    label: 'MFI',
    options: [
      { key: 'mfi14', label: 'MFI 14' },
      { key: 'deltaMfi14', label: 'Delta MFI 14' },
      { key: 'deltaSqMfi14', label: 'Delta Delta MFI 14' }
    ]
  },
  {
    label: 'SMI',
    options: [
      { key: 'smiLine', label: 'SMI Line' },
      { key: 'deltaSMI', label: 'Delta SMI' },
      { key: 'deltaSqSmiLine', label: 'Delta Delta SMI Line' },
      { key: 'smiSignal', label: 'SMI Signal' },
      { key: 'deltaSMISignal', label: 'Delta SMI Signal' },
      { key: 'deltaSqSmiSignal', label: 'Delta Delta SMI Signal' },
      { key: 'smiDist', label: 'SMI Dist' },
      { key: 'deltaSMIDist', label: 'Delta SMI Dist' },
      { key: 'deltaSqSMIDist', label: 'Delta Delta SMI Dist' }
    ]
  }
];

const TIMEFRAMES = ['1m', '5m', '10m', '15m', '30m', '1h', '1d'];
const OPERATORS = ['>', '>=', '==', '<=', '<', '!=', 'crossover', 'crossunder'];

// ── Detail Table Column Groups & Options (Parity with StockDataTable) ───────────
const DETAIL_COLUMN_GROUPS = [
  {
    group: 'core', label: 'Core', color: 'text-slate-300', cols: [
      { key: 'open',   label: 'Open',   always: true },
      { key: 'high',   label: 'High',   always: true },
      { key: 'low',    label: 'Low',    always: true },
      { key: 'close',  label: 'Close',  always: true },
      { key: 'volume', label: 'Volume', always: true },
    ],
  },
  {
    group: 'sma', label: 'SMA', color: 'text-amber-400', cols: [
      { key: 'sma20',        label: 'SMA 20' },
      { key: 'deltaSma20',   label: 'Δ SMA 20' },
      { key: 'deltaSqSma20', label: 'Δ² SMA 20' },
      { key: 'sma50',        label: 'SMA 50' },
      { key: 'deltaSma50',   label: 'Δ SMA 50' },
      { key: 'deltaSqSma50', label: 'Δ² SMA 50' },
      { key: 'sma100',        label: 'SMA 100' },
      { key: 'deltaSma100',   label: 'Δ SMA 100' },
      { key: 'deltaSqSma100', label: 'Δ² SMA 100' },
      { key: 'sma200',        label: 'SMA 200' },
      { key: 'deltaSma200',   label: 'Δ SMA 200' },
      { key: 'deltaSqSma200', label: 'Δ² SMA 200' },
    ],
  },
  {
    group: 'ema', label: 'EMA', color: 'text-purple-400', cols: [
      { key: 'ema20',        label: 'EMA 20' },
      { key: 'deltaEma20',   label: 'Δ EMA 20' },
      { key: 'deltaSqEma20', label: 'Δ² EMA 20' },
      { key: 'ema50',        label: 'EMA 50' },
      { key: 'deltaEma50',   label: 'Δ EMA 50' },
      { key: 'deltaSqEma50', label: 'Δ² EMA 50' },
      { key: 'ema100',        label: 'EMA 100' },
      { key: 'deltaEma100',   label: 'Δ EMA 100' },
      { key: 'deltaSqEma100', label: 'Δ² EMA 100' },
      { key: 'ema200',        label: 'EMA 200' },
      { key: 'deltaEma200',   label: 'Δ EMA 200' },
      { key: 'deltaSqEma200', label: 'Δ² EMA 200' },
    ],
  },
  {
    group: 'rsi', label: 'RSI', color: 'text-violet-400', cols: [
      { key: 'rsi14',        label: 'RSI 14' },
      { key: 'deltaRsi14',   label: 'Δ RSI 14' },
      { key: 'deltaSqRsi14', label: 'Δ² RSI 14' },
    ],
  },
  {
    group: 'bb', label: 'Bollinger Bands', color: 'text-slate-400', cols: [
      { key: 'bbUpper',        label: 'BB Upper' },
      { key: 'deltaBbUpper',   label: 'Δ BB Upper' },
      { key: 'deltaSqBbUpper', label: 'Δ² BB Upper' },
      { key: 'bbMid',          label: 'BB Mid' },
      { key: 'deltaBbMid',     label: 'Δ BB Mid' },
      { key: 'deltaSqBbMid',   label: 'Δ² BB Mid' },
      { key: 'bbLower',        label: 'BB Lower' },
      { key: 'deltaBbLower',   label: 'Δ BB Lower' },
      { key: 'deltaSqBbLower', label: 'Δ² BB Lower' },
    ],
  },
  {
    group: 'macd', label: 'MACD', color: 'text-sky-400', cols: [
      { key: 'macd',           label: 'MACD' },
      { key: 'deltaMacd',      label: 'Δ MACD' },
      { key: 'deltaSqMacd',    label: 'Δ² MACD' },
      { key: 'macdSig',        label: 'MACD Signal' },
      { key: 'deltaMacdSig',   label: 'Δ MACD Signal' },
      { key: 'deltaSqMacdSig', label: 'Δ² MACD Signal' },
      { key: 'macdHist',        label: 'MACD Hist' },
      { key: 'deltaMacdHist',   label: 'Δ MACD Hist' },
      { key: 'deltaSqMacdHist', label: 'Δ² MACD Hist' },
    ],
  },
  {
    group: 'adx', label: 'ADX / DI', color: 'text-yellow-400', cols: [
      { key: 'adx',        label: 'ADX' },
      { key: 'deltaADX',   label: 'Δ ADX' },
      { key: 'deltaSqADX', label: 'Δ² ADX' },
      { key: 'plusDI',        label: '+DI' },
      { key: 'deltaPlusDI',   label: 'Δ +DI' },
      { key: 'deltaSqPlusDI', label: 'Δ² +DI' },
      { key: 'minusDI',        label: '-DI' },
      { key: 'deltaMinusDI',   label: 'Δ -DI' },
      { key: 'deltaSqMinusDI', label: 'Δ² -DI' },
      { key: 'di',        label: 'DI (+DI−-DI)' },
      { key: 'deltaDI',   label: 'Δ DI' },
      { key: 'deltaSqDI', label: 'Δ² DI' },
    ],
  },
  {
    group: 'mfi', label: 'MFI', color: 'text-cyan-400', cols: [
      { key: 'mfi',        label: 'MFI 14' },
      { key: 'deltaMfi',   label: 'Δ MFI 14' },
      { key: 'deltaSqMfi', label: 'Δ² MFI 14' },
    ],
  },
  {
    group: 'smi', label: 'SMI', color: 'text-emerald-400', cols: [
      { key: 'smi',              label: 'SMI' },
      { key: 'deltaSMI',         label: 'Δ SMI' },
      { key: 'deltaSqSmi',       label: 'Δ² SMI' },
      { key: 'smiSignal',        label: 'SMI Signal' },
      { key: 'deltaSMISignal',   label: 'Δ SMI Signal' },
      { key: 'deltaSqSmiSignal', label: 'Δ² SMI Signal' },
      { key: 'smiDist',          label: 'SMI Dist' },
      { key: 'deltaSMIDist',     label: 'Δ SMI Dist' },
      { key: 'deltaSqSmiDist',   label: 'Δ² SMI Dist' },
    ],
  },
];

const DEFAULT_VISIBLE = new Set([
  'open', 'high', 'low', 'close', 'volume',
  'sma20', 'sma50', 'ema20', 'rsi14',
]);

const ALL_DETAIL_COL_KEYS = DETAIL_COLUMN_GROUPS.flatMap(g => g.cols.map(c => c.key));
const DETAIL_COL_META = Object.fromEntries(
  DETAIL_COLUMN_GROUPS.flatMap(g => g.cols.map(c => [c.key, { ...c, group: g.group, color: g.color }]))
);

const IND_KEY_MAP = {
  sma20: 'sma20', deltaSma20: 'deltaSma20', deltaSqSma20: 'deltaSqSma20',
  sma50: 'sma50', deltaSma50: 'deltaSma50', deltaSqSma50: 'deltaSqSma50',
  sma100: 'sma100', deltaSma100: 'deltaSma100', deltaSqSma100: 'deltaSqSma100',
  sma200: 'sma200', deltaSma200: 'deltaSma200', deltaSqSma200: 'deltaSqSma200',
  ema20: 'ema20', deltaEma20: 'deltaEma20', deltaSqEma20: 'deltaSqEma20',
  ema50: 'ema50', deltaEma50: 'deltaEma50', deltaSqEma50: 'deltaSqEma50',
  ema100: 'ema100', deltaEma100: 'deltaEma100', deltaSqEma100: 'deltaSqEma100',
  ema200: 'ema200', deltaEma200: 'deltaEma200', deltaSqEma200: 'deltaSqEma200',
  rsi14: 'rsi14', deltaRsi14: 'deltaRsi14', deltaSqRsi14: 'deltaSqRsi14',
  bbUpper: 'bbUpper', deltaBbUpper: 'deltaBbUpper', deltaSqBbUpper: 'deltaSqBbUpper',
  bbMiddle: 'bbMid', deltaBbMiddle: 'deltaBbMid', deltaSqBbMiddle: 'deltaSqBbMid',
  bbLower: 'bbLower', deltaBbLower: 'deltaBbLower', deltaSqBbLower: 'deltaSqBbLower',
  macdLine: 'macd', deltaMacdLine: 'deltaMacd', deltaSqMacdLine: 'deltaSqMacd',
  macdSignal: 'macdSig', deltaMacdSignal: 'deltaMacdSig', deltaSqMacdSignal: 'deltaSqMacdSig',
  macdHist: 'macdHist', deltaMacdHist: 'deltaMacdHist', deltaSqMacdHist: 'deltaSqMacdHist',
  adx: 'adx', deltaADX: 'deltaADX', deltaSqADX: 'deltaSqADX',
  plusDI: 'plusDI', deltaPlusDI: 'deltaPlusDI', deltaSqPlusDI: 'deltaSqPlusDI',
  minusDI: 'minusDI', deltaMinusDI: 'deltaMinusDI', deltaSqMinusDI: 'deltaSqMinusDI',
  di: 'di', deltaDI: 'deltaDI', deltaSqDI: 'deltaSqDI',
  mfi14: 'mfi', deltaMfi14: 'deltaMfi', deltaSqMfi14: 'deltaSqMfi',
  smiLine: 'smi', deltaSmiLine: 'deltaSMI', deltaSqSmiLine: 'deltaSqSmi',
  smiSignal: 'smiSignal', deltaSmiSignal: 'deltaSMISignal', deltaSqSmiSignal: 'deltaSqSmiSignal',
  smiDist: 'smiDist', deltaSMIDist: 'deltaSMIDist', deltaSqSmiDist: 'deltaSqSmiDist',
};

// ── Format helpers ────────────────────────────────────────────────────────────
const p  = (n, d = 2)  => (n != null && !isNaN(n)) ? Number(n).toFixed(d) : '—';
const pd = (n, d = 3)  => (n != null && !isNaN(n)) ? (n >= 0 ? '+' : '') + Number(n).toFixed(d) : '—';

export default function BacktestDashboard({ watchlists, selectedId }) {
  // Persist selections and inputs in LocalStorage
  const [initialCapital, setInitialCapital] = useState(() => {
    return localStorage.getItem('aw_backtest_capital') || '50000';
  });
  const [transactionCostPct, setTransactionCostPct] = useState(() => {
    return localStorage.getItem('aw_backtest_cost') || '0.5';
  });
  const [timeframe, setTimeframe] = useState(() => {
    return localStorage.getItem('aw_backtest_timeframe') || '5m';
  });

  const [buyConditions, setBuyConditions] = useState(() => {
    try {
      const saved = localStorage.getItem('aw_backtest_buy_conditions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].leftIndicator && !parsed[0].rules) {
          return [{ rules: parsed }];
        }
        return parsed;
      }
    } catch {}
    return [
      {
        rules: [
          { timeframe: '5m', leftIndicator: 'rsi14', operator: '<', rightType: 'value', rightValue: '30', rightIndicator: 'close' }
        ]
      }
    ];
  });
  const [sellConditions, setSellConditions] = useState(() => {
    try {
      const saved = localStorage.getItem('aw_backtest_sell_conditions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].leftIndicator && !parsed[0].rules) {
          return [{ rules: parsed, sellPct: 100 }];
        }
        return parsed;
      }
    } catch {}
    return [
      {
        sellPct: 100,
        rules: [
          { timeframe: '5m', leftIndicator: 'rsi14', operator: '>', rightType: 'value', rightValue: '70', rightIndicator: 'close' }
        ]
      }
    ];
  });

  const [results, setResults] = useState(() => {
    try {
      const saved = localStorage.getItem('aw_backtest_results');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [selectedStockDetails, setSelectedStockDetails] = useState(null);

  // Sync to LocalStorage on updates
  useEffect(() => {
    try { localStorage.setItem('aw_backtest_capital', initialCapital); } catch (e) {}
  }, [initialCapital]);

  useEffect(() => {
    try { localStorage.setItem('aw_backtest_cost', transactionCostPct); } catch (e) {}
  }, [transactionCostPct]);

  useEffect(() => {
    try { localStorage.setItem('aw_backtest_timeframe', timeframe); } catch (e) {}
  }, [timeframe]);

  useEffect(() => {
    try { localStorage.setItem('aw_backtest_buy_conditions', JSON.stringify(buyConditions)); } catch (e) {}
  }, [buyConditions]);

  useEffect(() => {
    try { localStorage.setItem('aw_backtest_sell_conditions', JSON.stringify(sellConditions)); } catch (e) {}
  }, [sellConditions]);

  useEffect(() => {
    try {
      // Strip heavy candle data to keep within local storage quota limit!
      const trimmed = results.map(r => ({
        symbol: r.symbol,
        exchange: r.exchange,
        initialCapital: r.initialCapital,
        finalAmount: r.finalAmount,
        percentageChange: r.percentageChange,
        tradesCount: r.tradesCount,
        candles: [] // Keep candles empty to save space. User can see results, but must re-run to view full trade log after reload.
      }));
      localStorage.setItem('aw_backtest_results', JSON.stringify(trimmed));
    } catch (e) {
      console.warn('Failed to save results to localStorage:', e);
    }
  }, [results]);

  const handleAddGroup = (type) => {
    const list = type === 'buy' ? buyConditions : sellConditions;
    const setter = type === 'buy' ? setBuyConditions : setSellConditions;
    setter([
      ...list,
      { rules: [], sellPct: 100 }
    ]);
  };

  const handleRemoveGroup = (type, groupIndex) => {
    const list = type === 'buy' ? buyConditions : sellConditions;
    const setter = type === 'buy' ? setBuyConditions : setSellConditions;
    setter(list.filter((_, idx) => idx !== groupIndex));
  };

  const handleGroupSellPctChange = (groupIndex, value) => {
    const updated = [...sellConditions];
    updated[groupIndex] = { ...updated[groupIndex], sellPct: parseFloat(value) || 0 };
    setSellConditions(updated);
  };

  const handleAddRuleRow = (type, groupIndex) => {
    const list = type === 'buy' ? buyConditions : sellConditions;
    const setter = type === 'buy' ? setBuyConditions : setSellConditions;
    const updated = [...list];
    updated[groupIndex] = {
      ...updated[groupIndex],
      rules: [
        ...(updated[groupIndex].rules || []),
        { timeframe, leftIndicator: 'close', operator: '>', rightType: 'value', rightValue: '', rightIndicator: 'close' }
      ]
    };
    setter(updated);
  };

  const handleRemoveRuleRow = (type, groupIndex, ruleIndex) => {
    const list = type === 'buy' ? buyConditions : sellConditions;
    const setter = type === 'buy' ? setBuyConditions : setSellConditions;
    const updated = [...list];
    updated[groupIndex] = {
      ...updated[groupIndex],
      rules: (updated[groupIndex].rules || []).filter((_, idx) => idx !== ruleIndex)
    };
    setter(updated);
  };

  const handleRuleRowChange = (type, groupIndex, ruleIndex, field, value) => {
    const list = type === 'buy' ? buyConditions : sellConditions;
    const setter = type === 'buy' ? setBuyConditions : setSellConditions;
    const updated = [...list];
    const rules = [...updated[groupIndex].rules];
    rules[ruleIndex] = { ...rules[ruleIndex], [field]: value };
    updated[groupIndex] = { ...updated[groupIndex], rules };
    setter(updated);
  };

  const runBacktest = async () => {
    if (!selectedId) return alert('Please select or create a watchlist first.');

    const totalBuyRules = buyConditions.reduce((acc, g) => acc + (g.rules?.length || 0), 0);
    const totalSellRules = sellConditions.reduce((acc, g) => acc + (g.rules?.length || 0), 0);
    if (totalBuyRules === 0 && totalSellRules === 0) {
      return alert('Please configure at least one buy or sell rule.');
    }

    setLoading(true);
    setResults([]);
    try {
      const cleanBuy = buyConditions.map(g => ({
        ...g,
        rules: (g.rules || []).map(c => ({
          ...c,
          rightValue: c.rightType === 'value' ? parseFloat(c.rightValue) : undefined,
          rightIndicator: c.rightType === 'indicator' ? c.rightIndicator : undefined
        }))
      }));
      const cleanSell = sellConditions.map(g => ({
        ...g,
        rules: (g.rules || []).map(c => ({
          ...c,
          rightValue: c.rightType === 'value' ? parseFloat(c.rightValue) : undefined,
          rightIndicator: c.rightType === 'indicator' ? c.rightIndicator : undefined
        })),
        sellPct: parseFloat(g.sellPct) || 100
      }));

      const { data } = await api.post('/backtest', {
        watchlistId: selectedId,
        timeframe,
        initialCapital: parseFloat(initialCapital),
        transactionCostPct: parseFloat(transactionCostPct),
        buyConditions: cleanBuy,
        sellConditions: cleanSell
      });

      setResults(data.results || []);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to execute backtest.');
    } finally {
      setLoading(false);
    }
  };

  // CSV Export for Main Comparison results
  const exportMainCsv = () => {
    if (!results.length) return;
    const headers = ['Stock', 'Trades', 'Initial Capital (INR)', 'Final Amount (INR)', 'Net Return (%)'];
    const rows = results.map(r => [
      `${r.exchange}:${r.symbol}`,
      r.tradesCount,
      r.initialCapital,
      r.finalAmount,
      `${r.percentageChange}%`
    ]);

    const headersEscaped = headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',');
    const rowStrs = rows.map(r => r.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[headersEscaped, ...rowStrs].join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `backtest_summary_${timeframe}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentWl = watchlists.find(w => w._id === selectedId);

  const inputCls = "w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 transition-colors";
  const inputStyle = { background: 'var(--bg-elevated)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' };

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in">
      {/* ── Configuration Panel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-5 border rounded-xl"
           style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
        
        {/* Left Side: Parameters & Run button */}
        <div className="flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400 mb-4">Backtesting Parameters</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Selected Watchlist</label>
                <div className="px-3 py-1.5 border rounded-lg text-xs font-bold font-mono"
                     style={{ background: 'var(--bg-base)', borderColor: 'var(--border-muted)', color: 'var(--text-secondary)' }}>
                  {currentWl ? `${currentWl.name} (${currentWl.stocks?.length || 0} stocks)` : 'No watchlist selected'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Initial Capital (₹)</label>
                  <input
                    type="number" value={initialCapital} onChange={e => setInitialCapital(e.target.value)}
                    className={inputCls} style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Slippage / Fee (%)</label>
                  <input
                    type="number" step="0.01" value={transactionCostPct} onChange={e => setTransactionCostPct(e.target.value)}
                    className={inputCls} style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Timeframe Interval</label>
                <select
                  value={timeframe} onChange={e => setTimeframe(e.target.value)}
                  className={inputCls} style={inputStyle}
                >
                  {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={runBacktest} disabled={loading || !currentWl || currentWl.stocks?.length === 0}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-lg shadow-indigo-600/10 shrink-0"
          >
            {loading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Backtesting Watchlist...
              </>
            ) : (
              <>
                <Play size={12} fill="white" />
                Run Backtesting Strategy
              </>
            )}
          </button>
        </div>

        {/* Middle and Right: Conditions columns */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Buy Conditions */}
          <div className="border border-emerald-900/30 rounded-xl p-4 bg-emerald-950/5 flex flex-col h-[400px] overflow-hidden">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Buy Conditions (OR Joined Groups)</span>
              <button
                type="button" onClick={() => handleAddGroup('buy')}
                className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase bg-emerald-900/30 border border-emerald-800/40 text-emerald-400 hover:bg-emerald-900/50 cursor-pointer transition-colors rounded-lg"
              >
                <Plus size={11} /> Add Group (OR)
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {buyConditions.length === 0 && (
                <p className="text-[10px] text-slate-500 italic text-center py-20">No buy groups set. Click "Add Group (OR)" above.</p>
              )}
              {buyConditions.map((group, gIdx) => (
                <div key={gIdx} className="border border-slate-800 rounded-lg p-3 space-y-3 bg-slate-950/10">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-[9px] font-black uppercase text-emerald-400">Group {gIdx + 1} {gIdx > 0 && '[OR]'}</span>
                    <button
                      type="button" onClick={() => handleRemoveGroup('buy', gIdx)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 cursor-pointer transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  
                  <div className="space-y-1.5">
                    {(group.rules || []).map((cond, idx) => (
                      <ConditionRow
                        key={idx} cond={cond} groupIndex={gIdx} idx={idx} type="buy"
                        onChange={handleRuleRowChange} onRemove={handleRemoveRuleRow}
                        inputCls={inputCls} inputStyle={inputStyle}
                      />
                    ))}
                    {(!group.rules || group.rules.length === 0) && (
                      <p className="text-[9px] text-slate-500 italic">No rules. Click "+ Add Rule (AND)".</p>
                    )}
                  </div>

                  <button
                    type="button" onClick={() => handleAddRuleRow('buy', gIdx)}
                    className="flex items-center gap-1 text-[8px] font-black uppercase px-2 py-1 border border-slate-800 text-indigo-400 bg-slate-900/40 hover:bg-slate-900/60 rounded cursor-pointer transition-colors"
                  >
                    <Plus size={10} /> Add Rule (AND)
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Sell Conditions */}
          <div className="border border-rose-900/30 rounded-xl p-4 bg-rose-950/5 flex flex-col h-[400px] overflow-hidden">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">Sell Conditions (OR Joined Groups)</span>
              <button
                type="button" onClick={() => handleAddGroup('sell')}
                className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase bg-rose-900/30 border border-rose-800/40 text-rose-400 hover:bg-rose-900/50 cursor-pointer transition-colors rounded-lg"
              >
                <Plus size={11} /> Add Group (OR)
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {sellConditions.length === 0 && (
                <p className="text-[10px] text-slate-500 italic text-center py-20">No sell groups set. Click "Add Group (OR)" above.</p>
              )}
              {sellConditions.map((group, gIdx) => (
                <div key={gIdx} className="border border-slate-800 rounded-lg p-3 space-y-3 bg-slate-950/10">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-[9px] font-black uppercase text-rose-400">Group {gIdx + 1} {gIdx > 0 && '[OR]'}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] font-black uppercase text-slate-400">Sell %:</span>
                        <input
                          type="number" min="1" max="100"
                          value={group.sellPct ?? 100}
                          onChange={(e) => handleGroupSellPctChange(gIdx, e.target.value)}
                          className="w-11 text-[10px] border rounded px-1 text-right focus:outline-none"
                          style={{ background: 'var(--bg-base)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <button
                        type="button" onClick={() => handleRemoveGroup('sell', gIdx)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 cursor-pointer transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    {(group.rules || []).map((cond, idx) => (
                      <ConditionRow
                        key={idx} cond={cond} groupIndex={gIdx} idx={idx} type="sell"
                        onChange={handleRuleRowChange} onRemove={handleRemoveRuleRow}
                        inputCls={inputCls} inputStyle={inputStyle}
                      />
                    ))}
                    {(!group.rules || group.rules.length === 0) && (
                      <p className="text-[9px] text-slate-500 italic">No rules. Click "+ Add Rule (AND)".</p>
                    )}
                  </div>

                  <button
                    type="button" onClick={() => handleAddRuleRow('sell', gIdx)}
                    className="flex items-center gap-1 text-[8px] font-black uppercase px-2 py-1 border border-slate-800 text-indigo-400 bg-slate-900/40 hover:bg-slate-900/60 rounded cursor-pointer transition-colors"
                  >
                    <Plus size={10} /> Add Rule (AND)
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── Results Dashboard ── */}
      <div className="border rounded-xl p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">Backtest Results</h3>
          {results.length > 0 && !loading && (
            <button
              onClick={exportMainCsv}
              className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 hover:text-indigo-200 hover:border-indigo-400 rounded-lg text-[9px] font-black uppercase cursor-pointer transition-colors"
            >
              <Download size={11} /> Export Summary CSV
            </button>
          )}
        </div>
        
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={32} className="text-indigo-400 animate-spin" />
            <p className="text-xs text-slate-400">Simulating trading strategy on historical data...</p>
          </div>
        )}

        {!loading && results.length === 0 && (
          <div className="text-center py-20">
            <Play size={40} className="mx-auto mb-3" style={{ color: 'var(--border-muted)' }} />
            <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>No Simulation Active</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-faint)' }}>Configure your strategy parameters above and click "Run Backtesting Strategy"</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b text-[10px] font-black uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)', borderColor: 'var(--border-base)' }}>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3 text-right">Trades</th>
                  <th className="px-4 py-3 text-right">Initial Capital (₹)</th>
                  <th className="px-4 py-3 text-right">Final Amount (₹)</th>
                  <th className="px-4 py-3 text-right">Net Return (%)</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map((res, idx) => {
                  const isPositive = res.percentageChange > 0;
                  const isNegative = res.percentageChange < 0;
                  
                  const returnCls = isPositive ? 'text-emerald-400 font-bold' : isNegative ? 'text-rose-400 font-bold' : 'text-slate-400';
                  const returnIcon = isPositive ? <ArrowUpRight size={13} className="inline mr-0.5" /> : isNegative ? <ArrowDownRight size={13} className="inline mr-0.5" /> : null;

                  return (
                    <tr key={idx} className="border-b last:border-0 hover:bg-slate-800/10 text-xs" style={{ borderColor: 'var(--border-base)' }}>
                      <td className="px-4 py-3.5 font-bold">
                        {res.exchange}:{res.symbol}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-300">{res.tradesCount}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-400">₹{Number(res.initialCapital).toFixed(2)}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-200">₹{Number(res.finalAmount).toFixed(2)}</td>
                      <td className={`px-4 py-3.5 text-right font-mono ${returnCls}`}>
                        {returnIcon}
                        {res.percentageChange > 0 ? '+' : ''}{res.percentageChange.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => setSelectedStockDetails(res)}
                          className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-lg text-[10px] font-black uppercase hover:bg-indigo-600/20 cursor-pointer transition-colors mx-auto"
                        >
                          <Eye size={11} />
                          Show Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Transaction Details Modal ── */}
      {selectedStockDetails && (
        <DetailsModal
          stock={selectedStockDetails}
          timeframe={timeframe}
          onClose={() => setSelectedStockDetails(null)}
        />
      )}
    </div>
  );
}

// ── Helper Row component for condition rendering ──
function ConditionRow({ cond, groupIndex, idx, type, onChange, onRemove, inputCls, inputStyle }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/20 border p-2 rounded-lg"
         style={{ borderColor: 'var(--border-muted)' }}>
      {/* Indicator */}
      <div className="flex-1 min-w-[100px]">
        <select
          value={cond.leftIndicator}
          onChange={e => onChange(type, groupIndex, idx, 'leftIndicator', e.target.value)}
          className={inputCls} style={inputStyle}
        >
          {INDICATOR_GROUPS.map(g => (
            <optgroup key={g.label} label={g.label} className="bg-slate-900 text-slate-300 font-bold">
              {g.options.map(ind => (
                <option key={ind.key} value={ind.key} className="bg-slate-950 text-slate-200 font-normal">
                  {ind.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Operator */}
      <div className="w-[85px]">
        <select
          value={cond.operator}
          onChange={e => onChange(type, groupIndex, idx, 'operator', e.target.value)}
          className={inputCls} style={inputStyle}
        >
          {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
        </select>
      </div>

      {/* Right Type (Value / Indicator) */}
      <div className="w-[75px]">
        <select
          value={cond.rightType}
          onChange={e => {
            onChange(type, groupIndex, idx, 'rightType', e.target.value);
            if (e.target.value === 'value') {
              onChange(type, groupIndex, idx, 'rightValue', '');
            } else {
              onChange(type, groupIndex, idx, 'rightIndicator', cond.leftIndicator);
            }
          }}
          className={inputCls} style={inputStyle}
        >
          <option value="value">Value</option>
          <option value="indicator">Indicator</option>
        </select>
      </div>

      {/* Right Value or Indicator */}
      {cond.rightType === 'value' ? (
        <div className="w-[65px]">
          <input
            type="number" step="any" required placeholder="0.0" value={cond.rightValue}
            onChange={e => onChange(type, groupIndex, idx, 'rightValue', e.target.value)}
            className={inputCls} style={inputStyle}
          />
        </div>
      ) : (
        <div className="flex-1 min-w-[100px]">
          <select
            value={cond.rightIndicator}
            onChange={e => onChange(type, groupIndex, idx, 'rightIndicator', e.target.value)}
            className={inputCls} style={inputStyle}
          >
            {INDICATOR_GROUPS.map(g => (
              <optgroup key={g.label} label={g.label} className="bg-slate-900 text-slate-300 font-bold">
                {g.options.map(ind => (
                  <option key={ind.key} value={ind.key} className="bg-slate-950 text-slate-200 font-normal">
                    {ind.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {/* Delete button */}
      <button
        type="button" onClick={() => onRemove(type, groupIndex, idx)}
        className="p-1 hover:text-red-400 cursor-pointer text-slate-500 transition-colors"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Transaction Details Modal (with full column picker and indicator table format) ──
function DetailsModal({ stock, timeframe, onClose }) {
  const [showColPanel, setShowColPanel] = useState(false);
  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const saved = localStorage.getItem('aw_backtest_visible_cols');
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return DEFAULT_VISIBLE;
  });

  useEffect(() => {
    localStorage.setItem('aw_backtest_visible_cols', JSON.stringify([...visibleCols]));
  }, [visibleCols]);

  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const getVal = useCallback((colKey, candle) => {
    if (!candle || !candle.indicators) return null;
    const backendKey = Object.entries(IND_KEY_MAP).find(([, v]) => v === colKey)?.[0] || colKey;
    return candle.indicators[backendKey] ?? null;
  }, []);

  const rsiColor = (v) => {
    if (v == null) return 'text-slate-600';
    if (v >= 70)   return 'text-red-400';
    if (v <= 30)   return 'text-emerald-400';
    return 'text-slate-300';
  };

  // Cell rendering for indicator columns
  const renderCell = (key, val) => {
    if (val == null || isNaN(val))
      return <td key={key} className="px-2 py-1.5 text-[10px] font-mono text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>—</td>;

    const isPos = val >= 0;
    let cls     = 'px-2 py-1.5 text-[10px] font-mono text-right tabular-nums whitespace-nowrap ';
    let display = p(val);

    if (key === 'rsi14')   { cls += rsiColor(val); display = p(val, 1); }
    else if (key === 'macdHist') { cls += isPos ? 'text-emerald-400/80' : 'text-rose-400/80'; display = pd(val); }
    else if (['macd', 'macdSig'].includes(key)) {
      cls += isPos ? 'text-emerald-400' : 'text-rose-400'; display = p(val, 3);
    } else if (['di', 'deltaPlusDI', 'deltaMinusDI', 'deltaDI', 'deltaADX', 'deltaSqADX', 'deltaMACD', 'deltaSMI', 'deltaSMISignal', 'smiDist', 'deltaSMIDist'].includes(key)) {
      cls += isPos ? 'text-emerald-400' : 'text-rose-400'; display = pd(val);
    } else if (key === 'smi' || key === 'smiSignal') {
      cls += isPos ? 'text-emerald-400' : 'text-rose-400'; display = p(val, 2);
    } else if (['adx', 'plusDI', 'minusDI', 'mfi'].includes(key)) {
      cls += 'text-yellow-300'; display = p(val, 2);
    } else {
      cls += DETAIL_COL_META[key]?.color || 'text-slate-300';
    }
    return <td key={key} className={cls}>{display}</td>;
  };

  // CSV Export for single stock trading logs
  const exportStockCsv = () => {
    if (!stock.candles?.length) return;
    const visKeys = ALL_DETAIL_COL_KEYS.filter(k => visibleCols.has(k));
    const headers = ['Transaction Price', 'Timestamp', ...visKeys.map(k => DETAIL_COL_META[k]?.label || k)];

    const rowStrs = stock.candles.map(c => {
      const cells = [
        c.transactionType ? `${c.transactionType.toUpperCase()} ${c.transactionPrice}` : '-',
        new Date(c.timestamp).toLocaleString('en-IN')
      ];
      visKeys.forEach(k => {
        if (['open', 'high', 'low', 'close', 'volume'].includes(k)) {
          cells.push(c[k]);
        } else {
          const v = getVal(k, c);
          cells.push(v !== null ? v : '');
        }
      });
      // Escape each cell by wrapping it in double quotes
      return cells.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
    });

    const headersEscaped = headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',');
    const blob = new Blob([[headersEscaped, ...rowStrs].join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `backtest_${stock.exchange}_${stock.symbol}_${timeframe}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const visKeys = ALL_DETAIL_COL_KEYS.filter(k => visibleCols.has(k));

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl border rounded-2xl shadow-2xl p-6 flex flex-col overflow-hidden h-[85vh]"
           style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b shrink-0" style={{ borderColor: 'var(--border-base)' }}>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-indigo-400">
              Simulation Details: {stock.exchange}:{stock.symbol}
            </h3>
            <p className="text-[10px] text-slate-500 font-bold mt-1">
              Timeframe: {timeframe} | Net Return: <span className={stock.percentageChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{stock.percentageChange > 0 ? '+' : ''}{stock.percentageChange}%</span> ({stock.tradesCount} trades)
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Columns Toggle Panel Trigger */}
            <button onClick={() => setShowColPanel(p => !p)}
              className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer ${
                showColPanel ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400' : 'text-slate-400 border-slate-700/35 hover:text-indigo-300'
              }`}
            >
              <Settings2 size={11} /> Columns
              <span className="px-1 py-0.5 bg-indigo-700/60 text-indigo-200 rounded text-[8px] font-black ml-0.5">
                {visKeys.length}
              </span>
            </button>

            {/* CSV Download Button */}
            <button
              onClick={exportStockCsv}
              className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600/10 border border-indigo-500/20 hover:border-indigo-400 text-indigo-400 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
            >
              <Download size={11} /> CSV
            </button>

            <button onClick={onClose} className="p-1 hover:text-indigo-400 transition-colors cursor-pointer text-slate-500 ml-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Column Picker Panel */}
        {showColPanel && (
          <div className="border-b px-4 py-3 shrink-0 overflow-y-auto max-h-40"
               style={{ background: 'var(--bg-base)', borderColor: 'var(--border-base)' }}>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {DETAIL_COLUMN_GROUPS.map(g => (
                <div key={g.group} className="flex flex-col gap-1 min-w-[110px]">
                  <label className="flex items-center gap-1.5 cursor-pointer mb-0.5">
                    <input type="checkbox"
                      checked={g.cols.filter(c => !c.always).every(c => visibleCols.has(c.key))}
                      onChange={() => {
                        const gc    = g.cols.filter(c => !c.always);
                        const allOn = gc.every(c => visibleCols.has(c.key));
                        setVisibleCols(prev => {
                          const n = new Set(prev);
                          gc.forEach(c => allOn ? n.delete(c.key) : n.add(c.key));
                          return n;
                        });
                      }}
                      className="w-3 h-3 accent-indigo-500" />
                    <span className={`text-[9px] font-black uppercase tracking-wider ${g.color}`}>{g.label}</span>
                  </label>
                  <div className="flex flex-col gap-0.5 ml-4">
                    {g.cols.map(col => (
                      <label key={col.key} className="flex items-center gap-1.5 cursor-pointer group">
                        <input type="checkbox" checked={visibleCols.has(col.key)}
                          onChange={() => !col.always && toggleCol(col.key)} disabled={col.always}
                          className="w-3 h-3 accent-indigo-500" />
                        <span className={`text-[10px] transition-colors ${visibleCols.has(col.key) ? 'text-slate-300' : 'text-slate-600'} group-hover:text-slate-200`}>
                          {col.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-2.5">
              <button onClick={() => setVisibleCols(new Set(ALL_DETAIL_COL_KEYS))} className="text-[9px] text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors">Select all</button>
              <span className="text-slate-600">·</span>
              <button onClick={() => setVisibleCols(new Set(ALL_DETAIL_COL_KEYS.filter(k => DETAIL_COL_META[k]?.always)))} className="text-[9px] cursor-pointer transition-colors text-slate-500">Clear indicators</button>
              <span className="text-slate-600">·</span>
              <button onClick={() => setVisibleCols(DEFAULT_VISIBLE)} className="text-[9px] cursor-pointer transition-colors text-slate-500">Reset to default</button>
            </div>
          </div>
        )}

        {/* Scrollable table content */}
        <div className="flex-1 overflow-auto mt-4 pr-1 flex flex-col">
          {!stock.candles || stock.candles.length === 0 ? (
            <div className="flex flex-col items-center justify-center m-auto py-12 text-slate-500 gap-2">
              <Play size={32} className="opacity-40" />
              <p className="text-xs font-bold text-slate-400">Trade Details Not In Memory</p>
              <p className="text-[10px] text-slate-500 text-center max-w-md leading-relaxed">
                This simulation's trade logs were cleared to prevent browser storage quota errors.
                Please re-run the backtesting simulation to view or export transaction logs for this stock.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 border-b" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
                <tr className="text-[9px] font-black uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>
                  <th className="px-4 py-3">Transaction Price (₹)</th>
                  <th className="px-4 py-3">Timestamp</th>
                  {visKeys.map(k => (
                    <th key={k} className={`px-2 py-3 ${k !== 'timestamp' ? 'text-right' : 'text-left'}`}>
                      {DETAIL_COL_META[k]?.label || k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...stock.candles].reverse().map((c, i) => {
                  const isBuy = c.transactionType === 'buy';
                  const isSell = c.transactionType === 'sell';

                  let rowBg = 'inherit';
                  let borderCls = 'border-transparent';
                  let textCls = 'text-slate-300';

                  if (isBuy) {
                    rowBg = 'rgba(16,185,129,0.08)';
                    borderCls = 'border-l-4 border-l-emerald-500';
                    textCls = 'text-emerald-300 font-extrabold';
                  } else if (isSell) {
                    rowBg = 'rgba(239,68,68,0.08)';
                    borderCls = 'border-l-4 border-l-rose-500';
                    textCls = 'text-rose-300 font-extrabold';
                  }

                  return (
                    <tr key={i} className={`border-b last:border-0 text-xs hover:bg-slate-800/10 ${borderCls}`}
                        style={{ borderColor: 'var(--border-base)', backgroundColor: rowBg }}>
                      <td className={`px-4 py-3 font-mono ${textCls}`}>
                        {isBuy ? '▲ BUY ₹' : isSell ? '▼ SELL ₹' : ''}
                        {c.transactionPrice}
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-400">
                        {new Date(c.timestamp).toLocaleString('en-IN')}
                      </td>
                      {visKeys.map(k => {
                        if (['open', 'high', 'low', 'close', 'volume'].includes(k)) {
                          const v   = +c[k];
                          const cls = k === 'close'  ? (+c.close >= +c.open ? 'text-right text-emerald-400 font-bold' : 'text-right text-rose-400 font-bold')
                                    : k === 'high'   ? 'text-right text-emerald-400'
                                    : k === 'low'    ? 'text-right text-rose-400'
                                    : k === 'volume' ? 'text-right text-sky-400'
                                    : 'text-right';
                          return (
                            <td key={k} className={`px-2 py-1.5 font-mono ${cls}`}>
                              {k === 'volume' ? Number(v).toLocaleString('en-IN') : p(v)}
                            </td>
                          );
                        }
                        return renderCell(k, getVal(k, c));
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
