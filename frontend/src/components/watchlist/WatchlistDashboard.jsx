// frontend/src/components/watchlist/WatchlistDashboard.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Minus, BarChart2, Table2, Bell, Trash2, Loader2, RefreshCw, Settings, Plus, X
} from 'lucide-react';
import api, { fetchIndicators, invalidateIndicatorCache } from '../../services/api';

const fmt2 = (n) => (n != null && !isNaN(n)) ? Number(n).toFixed(2) : '—';
const fmtV = (n) => {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_00_00_000) return (n / 1_00_00_000).toFixed(1) + ' Cr';
  if (n >= 1_00_000)    return (n / 1_00_000).toFixed(1) + ' L';
  if (n >= 1_000)       return (n / 1_000).toFixed(0) + 'K';
  return String(n);
};

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

const precedence = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2
};

const isOperator = (t) => t === '+' || t === '-' || t === '*' || t === '/';

function infixToPostfix(tokens) {
  const outputQueue = [];
  const operatorStack = [];

  for (const token of tokens) {
    if (typeof token === 'number') {
      outputQueue.push(token);
    } else if (isOperator(token)) {
      while (
        operatorStack.length > 0 &&
        isOperator(operatorStack[operatorStack.length - 1]) &&
        precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
      ) {
        outputQueue.push(operatorStack.pop());
      }
      operatorStack.push(token);
    } else if (token === '(') {
      operatorStack.push(token);
    } else if (token === ')') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
        outputQueue.push(operatorStack.pop());
      }
      operatorStack.pop();
    }
  }

  while (operatorStack.length > 0) {
    const op = operatorStack.pop();
    if (op !== '(' && op !== ')') {
      outputQueue.push(op);
    }
  }

  return outputQueue;
}

function evaluatePostfix(postfixTokens) {
  const stack = [];

  for (const token of postfixTokens) {
    if (typeof token === 'number') {
      stack.push(token);
    } else if (isOperator(token)) {
      if (stack.length < 2) {
        return 0;
      }
      const b = stack.pop();
      const a = stack.pop();
      let result = 0;
      switch (token) {
        case '+': result = a + b; break;
        case '-': result = a - b; break;
        case '*': result = a * b; break;
        case '/': result = b !== 0 ? a / b : 0; break;
      }
      stack.push(result);
    }
  }

  return stack.length === 1 ? stack[0] : 0;
}

function convertLegacyScoreConditions(legacy) {
  if (!Array.isArray(legacy) || legacy.length === 0) {
    return [
      {
        type: 'operand',
        valueType: 'indicator',
        timeframe: '5m',
        indicator: 'close'
      }
    ];
  }

  if (legacy[0] && legacy[0].type) {
    return legacy;
  }

  const tokens = [];
  legacy.forEach((c, idx) => {
    tokens.push({ type: 'parenthesis', valueStr: '(' });
    tokens.push({
      type: 'operand',
      valueType: c.leftType || 'value',
      timeframe: c.timeframe || '5m',
      value: c.leftType === 'value' ? parseFloat(c.leftValue || 0) : undefined,
      indicator: c.leftType === 'indicator' ? c.leftIndicator || 'close' : undefined
    });
    tokens.push({ type: 'operator', valueStr: '-' });
    tokens.push({
      type: 'operand',
      valueType: c.rightType || 'value',
      timeframe: c.timeframe || '5m',
      value: c.rightType === 'value' ? parseFloat(c.rightValue || 0) : undefined,
      indicator: c.rightType === 'indicator' ? c.rightIndicator || 'close' : undefined
    });
    tokens.push({ type: 'parenthesis', valueStr: ')' });
    tokens.push({ type: 'operator', valueStr: '*' });
    tokens.push({
      type: 'operand',
      valueType: 'value',
      value: isNaN(parseFloat(c.multiplier)) ? 1 : parseFloat(c.multiplier)
    });

    if (idx < legacy.length - 1) {
      tokens.push({ type: 'operator', valueStr: '+' });
    }
  });

  return tokens;
}

const TIMEFRAMES = ['1m', '5m', '10m', '15m', '30m', '1h', '1d'];

export default function WatchlistDashboard({
  watchlists,
  selectedId,
  socket,
  onOpenChart,
  onOpenTable,
  onOpenAlert,
  onRemoveStock,
  onWatchlistsChange,
}) {
  const [quotes, setQuotes] = useState({});
  const [indicators, setIndicators] = useState({});
  const [loading, setLoading] = useState(false);
  const [flashes, setFlashes] = useState({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Score settings and local copy for modifications
  const [localConditions, setLocalConditions] = useState([]);
  const [formulaText, setFormulaText] = useState('');
  const [caretPos, setCaretPos] = useState(0);

  // Scoring systems pool states
  const [scoringSystems, setScoringSystems] = useState([]);
  const [showScoringPoolManager, setShowScoringPoolManager] = useState(false);
  const [newScoringName, setNewScoringName] = useState('');
  const [editingSystem, setEditingSystem] = useState(null);

  // Condition pool states for stock-specific assignments
  const [conditionsPool, setConditionsPool] = useState([]);
  const [globalConfig, setGlobalConfig] = useState({ enabled: false, capital: 50000 });
  const [selectedStockForAssign, setSelectedStockForAssign] = useState(null);
  const [selectedBuyId, setSelectedBuyId] = useState('');
  const [selectedSellId, setSelectedSellId] = useState('');
  const [assignCapital, setAssignCapital] = useState('');

  const prevLtps = useRef({});
  const flashTimers = useRef({});
  const current = watchlists.find((w) => w._id === selectedId);

  const activeScoringSys = useMemo(() => {
    if (current?.assignedScoringSystemId) {
      const found = scoringSystems.find(s => s._id === current.assignedScoringSystemId);
      if (found) return found;
    }
    // Fallback: use first available user-wide scoring system
    if (scoringSystems.length > 0) return scoringSystems[0];
    return null;
  }, [current?.assignedScoringSystemId, scoringSystems]);

  const activeConditions = useMemo(() => {
    return activeScoringSys ? activeScoringSys.conditions : (current?.scoreConditions || []);
  }, [activeScoringSys, current?.scoreConditions]);

  // Sync condition templates pool and global config from backend
  useEffect(() => {
    const fetchTradeSettings = async () => {
      try {
        const res = await api.get('/trade/config');
        if (res.data?.success) {
          setConditionsPool(res.data.conditions || []);
          setGlobalConfig(res.data.config || { enabled: false, capital: 50000 });
          setScoringSystems(res.data.scoringSystems || []);
        }
      } catch (err) {
        console.error('Failed to fetch trade settings:', err);
      }
    };
    fetchTradeSettings();
  }, [refreshTrigger, selectedId]);

  // Sync local conditions when the active watchlist changes
  useEffect(() => {
    if (activeConditions && activeConditions.length > 0) {
      setLocalConditions(convertLegacyScoreConditions(activeConditions));
    } else {
      setLocalConditions([
        {
          type: 'operand',
          valueType: 'indicator',
          timeframe: '5m',
          indicator: 'close'
        }
      ]);
    }
  }, [current?._id, activeConditions]);

  // ── Fetch batch quotes and indicators when watchlist, score conditions or refresh changes ──
  useEffect(() => {
    if (!current?.stocks || current.stocks.length === 0) {
      setQuotes({});
      setIndicators({});
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        // 1. Fetch batch quotes (instant)
        const payload = current.stocks.map((s) => ({ symbol: s.symbol, exchange: s.exchange }));
        const quoteRes = await api.post('/stock/quotes', { stocks: payload });
        
        if (cancelled) return;

        const newQuotes = {};
        if (quoteRes.data?.success && quoteRes.data.quotes) {
          quoteRes.data.quotes.forEach((q) => {
            const key = `${q.exchange.toUpperCase()}:${q.symbol.toUpperCase()}`;
            newQuotes[key] = {
              ...q.metrics,
              ltp: q.metrics.lastPrice,
            };
            prevLtps.current[key] = q.metrics.lastPrice;
          });
          setQuotes(newQuotes);
        }

        // Set loading to false early so user sees prices instantly in msec!
        setLoading(false);

        // Determine all unique timeframes referenced in the formula to progressively fetch indicators
        const conditions = convertLegacyScoreConditions(activeConditions);
        const neededTimeframes = Array.from(
          new Set(
            conditions
              .filter((c) => c.type === 'operand' && c.valueType === 'indicator' && c.timeframe)
              .map((c) => c.timeframe)
          )
        );

        // Reset indicators state
        setIndicators({});

        // 2. Fetch indicators for all stocks progressively across all needed timeframes
        current.stocks.forEach(async (s) => {
          const key = `${s.exchange.toUpperCase()}:${s.symbol.toUpperCase()}`;
          
          for (const tf of neededTimeframes) {
            try {
              const indData = await fetchIndicators(s.exchange, s.symbol, tf);
              if (cancelled) return;
              
              const latestValues = {};
              for (const [indKey, arr] of Object.entries(indData)) {
                latestValues[indKey] = (arr && arr.length > 0) ? arr[arr.length - 1] : null;
              }
              
              setIndicators((prev) => ({
                ...prev,
                [`${key}:${tf}`]: latestValues,
              }));
            } catch (err) {
              console.error(`Failed to fetch indicators progressively for ${key}:${tf}:`, err);
            }
          }
        });
      } catch (err) {
        console.error('Error loading watchlist dashboard data:', err);
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [current?.stocks, activeConditions, refreshTrigger]);

  // ── Handle real-time socket tick updates ──
  useEffect(() => {
    if (!socket) return;

    const handleTick = (data) => {
      const key = `${data.exchange.toUpperCase()}:${data.symbol.toUpperCase()}`;
      
      // Update quote
      setQuotes((prev) => {
        if (!prev[key]) return prev;
        return {
          ...prev,
          [key]: {
            ...prev[key],
            ltp: data.ltp,
            volume: data.volume,
            percentChange: data.percentChange,
            open: data.open,
            high: data.high,
            low: data.low,
            prevClose: data.prevClose,
          },
        };
      });

      // Handle flash transition
      const prevLtp = prevLtps.current[key];
      if (prevLtp != null && data.ltp !== prevLtp) {
        const dir = data.ltp > prevLtp ? 'up' : 'down';
        setFlashes((prev) => ({ ...prev, [key]: dir }));
        clearTimeout(flashTimers.current[key]);
        flashTimers.current[key] = setTimeout(() => {
          setFlashes((prev) => ({ ...prev, [key]: null }));
        }, 600);
      }
      prevLtps.current[key] = data.ltp;
    };

    socket.on('tick', handleTick);
    return () => {
      socket.off('tick', handleTick);
      // Clean up all flash timers
      Object.values(flashTimers.current).forEach(clearTimeout);
    };
  }, [socket]);

  // ── Handle real-time candle updates to refresh indicators ──
  useEffect(() => {
    if (!socket) return;

    const conditions = convertLegacyScoreConditions(activeConditions);
    const neededTimeframes = Array.from(
      new Set(
        conditions
          .filter((c) => c.type === 'operand' && c.valueType === 'indicator' && c.timeframe)
          .map((c) => c.timeframe)
      )
    );

    const handleCandleUpdate = async (data) => {
      // data: { key, interval, candle }
      if (!neededTimeframes.includes(data.interval)) return;
      const [exchange, symbol] = data.key.split(':');
      const key = `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;
      
      try {
        invalidateIndicatorCache(exchange, symbol, data.interval);
        const indData = await fetchIndicators(exchange, symbol, data.interval);
        
        const latestValues = {};
        for (const [indKey, arr] of Object.entries(indData)) {
          latestValues[indKey] = (arr && arr.length > 0) ? arr[arr.length - 1] : null;
        }

        setIndicators((prev) => ({
          ...prev,
          [`${key}:${data.interval}`]: latestValues,
        }));
      } catch (err) {
        console.error(`Failed to refresh indicator on candle update for ${data.key}:${data.interval}:`, err);
      }
    };

    socket.on('candle_update', handleCandleUpdate);
    return () => {
      socket.off('candle_update', handleCandleUpdate);
    };
  }, [socket, activeConditions]);

  // ── Helper to retrieve indicator/value ──
  const getIndicatorValue = (stockKey, tf, type, valOrIndicator) => {
    if (type === 'value') {
      return parseFloat(valOrIndicator || 0);
    }
    const indicatorName = valOrIndicator;
    const quote = quotes[stockKey];
    
    if (indicatorName === 'close' || indicatorName === 'ltp') {
      return quote?.ltp ?? 0;
    }
    if (indicatorName === 'open') {
      return quote?.open ?? 0;
    }
    if (indicatorName === 'high') {
      return quote?.high ?? 0;
    }
    if (indicatorName === 'low') {
      return quote?.low ?? 0;
    }
    if (indicatorName === 'volume') {
      return quote?.volume ?? 0;
    }

    const indObj = indicators[`${stockKey}:${tf}`];
    if (!indObj) return 0;
    
    const value = indObj[indicatorName];
    return value != null && !isNaN(value) ? value : 0;
  };

  // ── Sort stocks by score descending ──
  const sortedStocks = useMemo(() => {
    if (!current?.stocks) return [];

    const conditions = convertLegacyScoreConditions(activeConditions);

    const stocksWithScore = current.stocks.map((stock) => {
      const key = `${stock.exchange.toUpperCase()}:${stock.symbol.toUpperCase()}`;
      
      const resolvedTokens = conditions.map((c) => {
        if (c.type === 'operand') {
          if (c.valueType === 'value') {
            return parseFloat(c.value ?? 0);
          } else {
            return getIndicatorValue(key, c.timeframe, 'indicator', c.indicator);
          }
        }
        return c.valueStr;
      });

      const postfix = infixToPostfix(resolvedTokens);
      const score = evaluatePostfix(postfix);

      return {
        ...stock,
        score,
      };
    });

    return [...stocksWithScore].sort((a, b) => b.score - a.score);
  }, [current?.stocks, activeConditions, quotes, indicators]);

  // ── Formula management handlers ──
  const handleAddToken = (token) => {
    setLocalConditions([...localConditions, token]);
  };

  const handleRemoveCondition = (index) => {
    setLocalConditions(localConditions.filter((_, i) => i !== index));
  };

  const handleClearFormula = () => {
    setLocalConditions([]);
  };

  const handleConditionChange = (index, field, val) => {
    const updated = [...localConditions];
    updated[index] = { ...updated[index], [field]: val };
    setLocalConditions(updated);
  };

  const isBalanced = useMemo(() => {
    let balance = 0;
    for (const t of localConditions) {
      if (t.type === 'parenthesis') {
        if (t.valueStr === '(') balance++;
        else if (t.valueStr === ')') balance--;
        if (balance < 0) return false;
      }
    }
    return balance === 0;
  }, [localConditions]);

  const convertConditionsToString = (conditions) => {
    if (!conditions) return '';
    return conditions.map(c => {
      if (c.type === 'parenthesis') return c.valueStr;
      if (c.type === 'operator') return c.valueStr;
      if (c.type === 'operand') {
        if (c.valueType === 'value') return c.value;
        return `${c.timeframe}:${c.indicator}`;
      }
      return '';
    }).join(' ');
  };

  const ALL_INDICATOR_KEYS = INDICATOR_GROUPS.flatMap(g => g.options.map(opt => opt.key));

  const getTokensWithBoundaries = (text) => {
    const regex = /(\(|\)|\+|-|\*|\/|[^\s()+\-*/]+)/g;
    let match;
    const tokens = [];
    let idx = 0;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = regex.lastIndex;
      const raw = match[0];
      
      let type = 'operand';
      let valueStr = raw;
      let valueType = 'indicator';
      let timeframe = '5m';
      let indicator = raw;
      let invalid = false;
      let value = null;

      if (['(', ')'].includes(raw)) {
        type = 'parenthesis';
      } else if (['+', '-', '*', '/'].includes(raw)) {
        type = 'operator';
      } else {
        if (!isNaN(raw)) {
          type = 'operand';
          valueType = 'value';
          value = parseFloat(raw);
        } else {
          type = 'operand';
          valueType = 'indicator';
          if (raw.includes(':')) {
            const parts = raw.split(':');
            timeframe = parts[0];
            indicator = parts[1];
          }
          invalid = !ALL_INDICATOR_KEYS.includes(indicator);
        }
      }

      tokens.push({
        idx,
        raw,
        start,
        end,
        type,
        valueStr,
        valueType,
        timeframe,
        indicator,
        invalid,
        value
      });
      idx++;
    }
    return tokens;
  };

  const getBracketHighlights = (tokens) => {
    const stack = [];
    const unbalanced = new Set();
    tokens.forEach((t, idx) => {
      if (t.type === 'parenthesis') {
        if (t.valueStr === '(') {
          stack.push(idx);
        } else if (t.valueStr === ')') {
          if (stack.length === 0) {
            unbalanced.add(idx);
          } else {
            stack.pop();
          }
        }
      }
    });
    stack.forEach(idx => unbalanced.add(idx));
    return unbalanced;
  };

  const handleApplyAutocomplete = (sug, token) => {
    const prefix = token.raw.includes(':') ? token.raw.split(':')[0] + ':' : '';
    const replacement = prefix + sug;
    const before = formulaText.substring(0, token.start);
    const after = formulaText.substring(token.end);
    const newText = before + replacement + after;
    setFormulaText(newText);
    const newCaretPos = token.start + replacement.length;
    setCaretPos(newCaretPos);
    setTimeout(() => {
      const inp = document.getElementById('formulaInput');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(newCaretPos, newCaretPos);
      }
    }, 10);
  };

  const handleAddTokenText = (tokenStr) => {
    const separator = (formulaText.length === 0 || formulaText.endsWith(' ') || tokenStr.startsWith(' ')) ? '' : ' ';
    const newText = formulaText + separator + tokenStr;
    setFormulaText(newText);
    setTimeout(() => {
      const inp = document.getElementById('formulaInput');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(newText.length, newText.length);
      }
    }, 10);
  };

  const modalTokens = useMemo(() => {
    return getTokensWithBoundaries(formulaText);
  }, [formulaText]);

  const modalUnbalancedBrackets = useMemo(() => {
    return getBracketHighlights(modalTokens);
  }, [modalTokens]);

  const activeTokenUnderCaret = useMemo(() => {
    return modalTokens.find(t => caretPos >= t.start && caretPos <= t.end);
  }, [modalTokens, caretPos]);

  const autocompleteSuggestions = useMemo(() => {
    if (!activeTokenUnderCaret || activeTokenUnderCaret.type !== 'operand' || activeTokenUnderCaret.valueType !== 'indicator') {
      return [];
    }
    const query = activeTokenUnderCaret.indicator;
    if (!query || query.length < 1) return [];
    
    return ALL_INDICATOR_KEYS.filter(key => 
      key.toLowerCase().includes(query.toLowerCase()) && 
      key.toLowerCase() !== query.toLowerCase()
    ).slice(0, 8);
  }, [activeTokenUnderCaret]);

  const handleSaveModalScoreConditions = async (sysId, newName) => {
    try {
      const response = await api.put(`/trade/scoring-systems/${sysId}`, {
        name: newName,
        formula: formulaText
      });
      if (response.data?.success) {
        setScoringSystems(response.data.scoringSystems);
        setEditingSystem(null);
        onWatchlistsChange?.();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save score settings.');
    }
  };

  if (!current) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
          Please select or create a watchlist to view the dashboard.
        </p>
      </div>
    );
  }

  const selectCls = "w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 transition-all cursor-pointer";
  const selectStyle = { background: 'var(--bg-elevated)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' };

  const selectGroupCls = "border-0 bg-transparent text-xs focus:outline-none cursor-pointer max-w-[170px]";

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
      {/* ── Dashboard Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--border-base)' }}>
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {current.name} Dashboard
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {current.stocks?.length || 0} stocks tracked in this watchlist
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Manual Refresh */}
          <div className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors cursor-pointer"
               style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-base)', color: 'var(--text-secondary)' }}
               onClick={() => setRefreshTrigger(t => t + 1)}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin text-indigo-400" />
            ) : (
              <RefreshCw size={14} className="hover:text-indigo-400 transition-colors" />
            )}
          </div>

          {/* Scoring System Selector Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Scoring System:
            </span>
            <select
              value={current.assignedScoringSystemId || ''}
              onChange={async (e) => {
                const val = e.target.value;
                try {
                  const res = await api.put(`/watchlists/${current._id}/assign-scoring`, {
                    assignedScoringSystemId: val || null
                  });
                  if (res.data?.success) {
                    onWatchlistsChange?.();
                  }
                } catch (err) {
                  alert(err.response?.data?.error || 'Failed to assign scoring system.');
                }
              }}
              className="border rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer focus:outline-none focus:border-indigo-500"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
            >
              <option value="">-- Choose scoring system --</option>
              {scoringSystems.map(s => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Manage Scoring button */}
          <button
            onClick={() => {
              setEditingSystem(null);
              setShowScoringPoolManager(true);
            }}
            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border cursor-pointer hover:text-indigo-400 flex items-center gap-1.5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-base)', color: 'var(--text-secondary)' }}
            title="Manage Reusable Scoring Systems"
          >
            <Settings size={12} />
            Manage Scoring
          </button>
        </div>
      </div>

      {/* ── Table Container ── */}
      <div className="flex-1 overflow-auto border rounded-xl" style={{ borderColor: 'var(--border-base)', background: 'var(--bg-surface)' }}>
        {(!current.stocks || current.stocks.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <BarChart2 size={44} style={{ color: 'var(--bg-elevated)' }} />
            <div className="text-center">
              <p className="font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>No stocks in this watchlist yet</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Use the search box at the top to add stocks.</p>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border-base)', background: 'var(--bg-elevated)' }}>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>Symbol</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>LTP</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>Change %</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>Open</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>High</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>Low</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>Prev Close</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-muted)' }}>Volume</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px] text-indigo-400" style={{ borderColor: 'var(--border-base)' }}>Score</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>Auto Trade</th>
                <th className="p-3 font-black uppercase tracking-wider text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-base)' }}>
              {sortedStocks.map((stock) => {
                const key = `${stock.exchange.toUpperCase()}:${stock.symbol.toUpperCase()}`;
                const quote = quotes[key];
                const flash = flashes[key];

                const pct = quote?.percentChange ?? 0;
                const isUp = pct > 0;
                const isDown = pct < 0;

                const ltpClass = flash === 'up' ? 'text-emerald-300'
                               : flash === 'down' ? 'text-rose-300'
                               : isUp ? 'text-emerald-400'
                               : isDown ? 'text-rose-400' : '';

                return (
                  <tr
                    key={key}
                    className="hover:bg-slate-500/5 transition-colors duration-150"
                    style={{
                      background: flash === 'up' ? 'rgba(34,197,94,0.03)' : flash === 'down' ? 'rgba(239,68,68,0.03)' : 'transparent'
                    }}
                  >
                    {/* Symbol */}
                    <td className="p-3 font-black">
                      <div className="flex items-center gap-2">
                        <span style={{ color: 'var(--text-primary)' }}>{stock.symbol}</span>
                        <span className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                          {stock.exchange}
                        </span>
                      </div>
                    </td>

                    {/* LTP */}
                    <td className={`p-3 font-mono font-bold transition-colors duration-150 ${ltpClass}`}
                        style={!ltpClass ? { color: 'var(--text-primary)' } : {}}>
                      ₹{fmt2(quote?.ltp)}
                    </td>

                    {/* Change % */}
                    <td className="p-3">
                      <span className={`font-mono font-bold flex items-center gap-0.5 ${isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : ''}`}
                            style={!isUp && !isDown ? { color: 'var(--text-muted)' } : {}}>
                        {isUp ? <TrendingUp size={10} /> : isDown ? <TrendingDown size={10} /> : <Minus size={10} />}
                        {pct >= 0 ? '+' : ''}{fmt2(pct)}%
                      </span>
                    </td>

                    {/* Open */}
                    <td className="p-3 font-mono" style={{ color: 'var(--text-secondary)' }}>
                      ₹{fmt2(quote?.open)}
                    </td>

                    {/* High */}
                    <td className="p-3 font-mono text-emerald-400/90">
                      ₹{fmt2(quote?.high)}
                    </td>

                    {/* Low */}
                    <td className="p-3 font-mono text-rose-400/90">
                      ₹{fmt2(quote?.low)}
                    </td>

                    {/* Prev Close */}
                    <td className="p-3 font-mono" style={{ color: 'var(--text-secondary)' }}>
                      ₹{fmt2(quote?.prevClose)}
                    </td>

                    {/* Volume */}
                    <td className="p-3 font-mono" style={{ color: 'var(--text-muted)' }}>
                      {fmtV(quote?.volume)}
                    </td>

                    {/* Score */}
                    <td className="p-3 font-mono font-bold text-indigo-400/90 text-sm">
                      {fmt2(stock.score)}
                    </td>

                    {/* Auto Trade */}
                    <td className="p-3">
                      {stock.autoTradeEnabled ? (
                        (() => {
                          const buyCond = conditionsPool.find((c) => c._id === stock.assignedBuyConditionId);
                          const sellCond = conditionsPool.find((c) => c._id === stock.assignedSellConditionId);
                          return (
                            <div className="flex flex-col gap-0.5 text-[9px] text-left min-w-[130px]">
                              <span className="font-extrabold text-emerald-400">🟢 Buy: {buyCond ? buyCond.name : 'Unknown'}</span>
                              <span className="font-extrabold text-rose-400">🔴 Sell: {sellCond ? sellCond.name : 'Unknown'}</span>
                              <span className="font-bold text-slate-300">💰 Capital: ₹{stock.tradeCapital || globalConfig.capital}</span>
                              <button
                                onClick={async () => {
                                  const confirmed = window.confirm(`Are you sure you want to DISABLE auto trading for ${stock.symbol}?`);
                                  if (!confirmed) return;
                                  try {
                                    const res = await api.post('/trade/toggle-stock', {
                                      watchlistId: current._id,
                                      symbol: stock.symbol,
                                      exchange: stock.exchange,
                                      autoTradeEnabled: false
                                    });
                                    if (res.data?.success) onWatchlistsChange?.();
                                  } catch (err) {
                                    alert(err.response?.data?.error || 'Failed to disable auto trading.');
                                  }
                                }}
                                className="text-[8px] text-rose-500 hover:text-rose-400 underline cursor-pointer text-left mt-0.5"
                              >
                                Disable
                              </button>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="text-center">
                          <button
                            onClick={() => {
                              setSelectedBuyId('');
                              setSelectedSellId('');
                              setAssignCapital('');
                              setSelectedStockForAssign(stock);
                            }}
                            className="px-2.5 py-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 text-[10px] font-black uppercase rounded border border-indigo-500/20 cursor-pointer transition-colors"
                          >
                            + Enable
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onOpenChart(stock.symbol, stock.exchange)}
                          className="p-1.5 rounded-lg border transition-colors cursor-pointer hover:text-indigo-400 hover:bg-indigo-500/10"
                          style={{ color: 'var(--text-muted)', borderColor: 'var(--border-base)' }}
                          title="Open Interactive Chart"
                        >
                          <BarChart2 size={13} />
                        </button>
                        <button
                          onClick={() => onOpenTable(stock.symbol, stock.exchange)}
                          className="p-1.5 rounded-lg border transition-colors cursor-pointer hover:text-sky-400 hover:bg-sky-500/10"
                          style={{ color: 'var(--text-muted)', borderColor: 'var(--border-base)' }}
                          title="View Data Table"
                        >
                          <Table2 size={13} />
                        </button>
                        <button
                          onClick={() => onOpenAlert(stock.symbol, stock.exchange)}
                          className="p-1.5 rounded-lg border transition-colors cursor-pointer hover:text-amber-400 hover:bg-amber-500/10"
                          style={{ color: 'var(--text-muted)', borderColor: 'var(--border-base)' }}
                          title="Set / View Alerts"
                        >
                          <Bell size={13} />
                        </button>
                        <button
                          onClick={() => onRemoveStock(stock.symbol, stock.exchange)}
                          className="p-1.5 rounded-lg border transition-colors cursor-pointer hover:text-rose-400 hover:bg-rose-500/10"
                          style={{ color: 'var(--text-faint)', borderColor: 'var(--border-base)' }}
                          title="Remove from Watchlist"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Reusable Allocation Picker Modal */}
      {selectedStockForAssign && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full border rounded-2xl p-6 space-y-4 shadow-2xl" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-100">
                Setup Auto Trading for {selectedStockForAssign.symbol}
              </h3>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Allocate exactly one Buy and one Sell strategy template from your pool for this stock.
              </p>
            </div>

            {conditionsPool.length === 0 ? (
              <div className="space-y-4 py-2">
                <p className="text-xs text-amber-400 font-bold bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                  ⚠️ No templates pool found. Please go to the "Auto Trade" tab first and add Buy/Sell conditions template rules.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => setSelectedStockForAssign(null)}
                    className="px-4 py-2 border text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-800"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-muted)' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase" style={{ color: 'var(--text-muted)' }}>Buy Condition Template</label>
                  <select
                    value={selectedBuyId}
                    onChange={(e) => setSelectedBuyId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    style={selectStyle}
                  >
                    <option value="">-- Choose Buy Condition --</option>
                    {conditionsPool.filter(c => c.type === 'buy').map(c => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase" style={{ color: 'var(--text-muted)' }}>Sell Condition Template</label>
                  <select
                    value={selectedSellId}
                    onChange={(e) => setSelectedSellId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    style={selectStyle}
                  >
                    <option value="">-- Choose Sell Condition --</option>
                    {conditionsPool.filter(c => c.type === 'sell').map(c => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase" style={{ color: 'var(--text-muted)' }}>Investment Capital (INR)</label>
                  <input
                    type="number" step="any"
                    placeholder={`e.g. 10000 (Defaults to global: ₹${globalConfig.capital})`}
                    value={assignCapital}
                    onChange={(e) => setAssignCapital(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setSelectedStockForAssign(null)}
                    className="px-4 py-2 border text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-800"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-muted)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!selectedBuyId || !selectedSellId) {
                        return alert('Please select both a Buy and a Sell condition.');
                      }
                      try {
                        const res = await api.post('/trade/toggle-stock', {
                          watchlistId: current._id,
                          symbol: selectedStockForAssign.symbol,
                          exchange: selectedStockForAssign.exchange,
                          autoTradeEnabled: true,
                          assignedBuyConditionId: selectedBuyId,
                          assignedSellConditionId: selectedSellId,
                          tradeCapital: assignCapital
                        });
                        if (res.data?.success) {
                          onWatchlistsChange?.();
                          setSelectedStockForAssign(null);
                        }
                      } catch (err) {
                        alert(err.response?.data?.error || 'Failed to enable auto trading.');
                      }
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-md"
                  >
                    Confirm Enable
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reusable Scoring Systems Pool Manager Modal */}
      {showScoringPoolManager && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl border rounded-2xl p-6 space-y-4 shadow-2xl animate-fade-in" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-base)' }}>
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border-base)' }}>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-100">
                  Manage Scoring Systems Pool
                </h3>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Create, delete, and configure reusable stock scoring formulas.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowScoringPoolManager(false);
                  setEditingSystem(null);
                }}
                className="p-1 rounded hover:bg-slate-800 border border-slate-700 text-slate-400 cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>

            {/* List and Create View */}
            {!editingSystem ? (
              <div className="space-y-4">
                {/* Create Named Scoring System Form */}
                <div className="flex items-center gap-2 border bg-slate-900/20 p-3 rounded-xl" style={{ borderColor: 'var(--border-muted)' }}>
                  <input
                    type="text" placeholder="e.g. Trend Score, EMA Cross Score..."
                    value={newScoringName}
                    onChange={e => setNewScoringName(e.target.value)}
                    className="flex-1 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none placeholder:text-slate-600"
                    style={{ background: 'var(--bg-base)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' }}
                  />
                  <button
                    onClick={async () => {
                      if (!newScoringName.trim()) return alert('Name is required.');
                      try {
                        const res = await api.post('/trade/scoring-systems', {
                          name: newScoringName.trim(),
                          conditions: [{ type: 'operand', valueType: 'indicator', timeframe: '5m', indicator: 'close' }]
                        });
                        if (res.data?.success) {
                          setScoringSystems(res.data.scoringSystems);
                          const newlyCreated = res.data.scoringSystems[res.data.scoringSystems.length - 1];
                          if (newlyCreated) {
                            setEditingSystem(newlyCreated);
                            setLocalConditions(newlyCreated.conditions || []);
                            setFormulaText(convertConditionsToString(newlyCreated.conditions));
                          }
                          setNewScoringName('');
                        }
                      } catch (err) {
                        alert(err.response?.data?.error || 'Failed to create.');
                      }
                    }}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-md shadow-indigo-600/10"
                  >
                    Create & Configure
                  </button>
                </div>

                {/* List systems */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {scoringSystems.map(sys => (
                    <div key={sys._id} className="flex items-center justify-between p-3 border rounded-xl" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-muted)' }}>
                      <div>
                        <span className="text-xs font-black text-slate-200">{sys.name}</span>
                        <span className="text-[9px] text-slate-500 block">
                          {sys.conditions?.length || 0} tokens in formula expression
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingSystem(sys);
                            setLocalConditions(sys.conditions || []);
                            setFormulaText(convertConditionsToString(sys.conditions));
                          }}
                          className="px-2.5 py-1 border text-[10px] font-bold rounded hover:bg-indigo-600/15 text-indigo-400 border-indigo-500/20 cursor-pointer"
                        >
                          Edit Formula
                        </button>
                        <button
                          onClick={async () => {
                            const confirmed = window.confirm(`Are you sure you want to delete "${sys.name}"? Watchlists using it will revert to the default scoring system.`);
                            if (!confirmed) return;
                            try {
                              const res = await api.delete(`/trade/scoring-systems/${sys._id}`);
                              if (res.data?.success) {
                                setScoringSystems(res.data.scoringSystems);
                                onWatchlistsChange?.();
                              }
                            } catch (err) {
                              alert(err.response?.data?.error || 'Failed to delete.');
                            }
                          }}
                          className="p-1.5 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 cursor-pointer border border-transparent transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {scoringSystems.length === 0 && (
                    <p className="text-[10px] text-slate-500 italic py-4 text-center">No custom scoring systems defined.</p>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t" style={{ borderColor: 'var(--border-base)' }}>
                  <button
                    onClick={() => {
                      setShowScoringPoolManager(false);
                      setEditingSystem(null);
                    }}
                    className="px-4 py-2 border text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-800"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-muted)' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              /* Scoring Formula Builder & Text Editor View Inside Modal */
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditingSystem(null)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-black uppercase tracking-wider"
                  >
                    ← Back to List
                  </button>
                  <span className="text-slate-700">|</span>
                  <label className="text-[10px] font-black uppercase text-slate-400">Formula Name:</label>
                  <input
                    type="text"
                    value={editingSystem.name}
                    onChange={(e) => setEditingSystem({ ...editingSystem, name: e.target.value })}
                    className="border rounded px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500"
                    style={{ background: 'var(--bg-base)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' }}
                  />
                </div>

                {/* 1. Keyboard Text Input Editor */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 block select-none">
                    Formula Expression (e.g. `(5m:ema20 + 5m:ema50) / 5m:close`):
                  </label>
                  <input
                    id="formulaInput"
                    type="text"
                    value={formulaText}
                    onChange={(e) => {
                      setFormulaText(e.target.value);
                      setCaretPos(e.target.selectionStart || 0);
                    }}
                    onKeyUp={(e) => setCaretPos(e.target.selectionStart || 0)}
                    onMouseUp={(e) => setCaretPos(e.target.selectionStart || 0)}
                    placeholder="e.g. (5m:ema20 + 5m:ema50) / 5m:close"
                    className="w-full border rounded-xl px-4 py-3 text-sm font-mono tracking-wide focus:outline-none focus:border-indigo-500"
                    style={{ background: 'var(--bg-base)', borderColor: 'var(--border-muted)', color: 'var(--text-primary)' }}
                  />
                </div>

                {/* 2. Autocomplete Suggestions overlay */}
                {autocompleteSuggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 p-2 bg-indigo-950/20 border border-indigo-900/30 rounded-xl animate-fade-in">
                    <span className="text-[9px] font-black uppercase text-indigo-400 mr-1 select-none">Suggestions:</span>
                    {autocompleteSuggestions.map(sug => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => handleApplyAutocomplete(sug, activeTokenUnderCaret)}
                        className="px-2.5 py-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/20 hover:border-indigo-500/40 text-[10px] font-black rounded-lg cursor-pointer transition-all"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}

                {/* 3. Live Syntax-Audit & Highlight Preview */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 block select-none">Live Audit Preview:</label>
                  <div className="flex flex-wrap items-center gap-2 p-4 min-h-[80px] rounded-xl border border-dashed"
                       style={{ borderColor: 'var(--border-muted)', background: 'var(--bg-base)' }}>
                    {modalTokens.map((token, idx) => {
                      const isEditing = caretPos >= token.start && caretPos <= token.end;
                      const isUnbalancedBracket = token.type === 'parenthesis' && modalUnbalancedBrackets.has(token.idx);
                      
                      let bgStyle = "bg-slate-800/40 text-slate-400 border border-slate-700/30";
                      
                      if (token.type === 'parenthesis') {
                        bgStyle = isUnbalancedBracket && !isEditing
                          ? "bg-rose-500/25 text-rose-300 border border-rose-500/50"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/30";
                      } else if (token.type === 'operator') {
                        bgStyle = "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30";
                      } else if (token.type === 'operand') {
                        if (token.valueType === 'value') {
                          bgStyle = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono";
                        } else {
                          bgStyle = token.invalid && !isEditing
                            ? "bg-rose-500/25 text-rose-300 border border-rose-500/50"
                            : "bg-sky-500/10 text-sky-400 border border-sky-500/30 font-bold";
                        }
                      }

                      return (
                        <span
                          key={idx}
                          className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center select-none ${bgStyle}`}
                          title={token.invalid && !isEditing ? `Unknown indicator name: "${token.indicator}"` : undefined}
                        >
                          {token.type === 'operand' && token.valueType === 'indicator' && token.timeframe ? (
                            <span>
                              <span className="opacity-40 font-normal mr-0.5">{token.timeframe}:</span>
                              {token.indicator}
                            </span>
                          ) : token.raw}
                        </span>
                      );
                    })}
                    {modalTokens.length === 0 && (
                      <span className="text-xs text-slate-500 italic select-none">Formula is empty. Use keyboard or visual buttons below.</span>
                    )}
                  </div>
                </div>

                {/* 4. Visual Quick-Add Elements Toolbar */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-base)' }}>
                  <span className="text-[10px] text-slate-400 uppercase font-black mr-2 select-none">Add Element:</span>

                  <button
                    type="button"
                    onClick={() => handleAddTokenText('5m:close')}
                    className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 border border-sky-500/30 text-sky-400 bg-sky-500/5 hover:bg-sky-500/10 rounded-lg cursor-pointer transition-colors"
                  >
                    <Plus size={10} /> Technical Indicator
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddTokenText('1')}
                    className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 border border-emerald-500/30 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 rounded-lg cursor-pointer transition-colors"
                  >
                    <Plus size={10} /> Constant Value
                  </button>

                  <div className="h-4 w-px bg-slate-700 mx-1"></div>

                  {['+', '-', '*', '/'].map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => handleAddTokenText(op)}
                      className="w-8 h-8 flex items-center justify-center text-xs font-bold border border-indigo-500/30 text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 rounded-lg cursor-pointer transition-colors"
                    >
                      {op === '*' ? '×' : op === '/' ? '÷' : op}
                    </button>
                  ))}

                  <div className="h-4 w-px bg-slate-700 mx-1"></div>

                  {['(', ')'].map((paren) => (
                    <button
                      key={paren}
                      type="button"
                      onClick={() => handleAddTokenText(paren)}
                      className="w-8 h-8 flex items-center justify-center text-xs font-bold border border-amber-500/30 text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 rounded-lg cursor-pointer transition-colors"
                    >
                      {paren}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--border-base)' }}>
                  <button
                    onClick={() => setEditingSystem(null)}
                    className="px-4 py-2 border text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-800/10 transition-colors"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-muted)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSaveModalScoreConditions(editingSystem._id, editingSystem.name)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-md shadow-indigo-600/10"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
