# AlphaWatch Trading System: Exhaustive Technical Reference Manual

This manual contains the complete specifications for the **AlphaWatch Scoring Language (AWSL)**, every available indicator, delta and delta-square derivatives, and functional examples for Watchlists, Backtesting, and Auto Trading.

---

## 1. Syntax, Keywords & Operators Reference

AWSL evaluates statements from left to right. Every script accumulates changes into the `score` variable (initially `0.00`).

### Keywords
- **`if`**: Starts a condition block.
- **`then`**: Concludes a condition; starts the body statement(s).
- **`elseif`**: Evaluates alternate conditions.
- **`else`**: Executes fallback statements if no condition is met.
- **`fi`**: Concludes the conditional block.
- **`score`**: The numeric score variable to modify.
- **`=`**: Assignment operator.

### Operators
- Arithmetic: `+`, `-`, `*`, `/`
- Grouping: `(`, `)`
- Comparison: `<`, `<=`, `>`, `>=`, `==`, `!=`
- Crossover (`crossover`): True if Left crossed above Right:
  $$\text{LatestLeft} \ge \text{LatestRight} \ \land \ \text{PreviousLeft} < \text{PreviousRight}$$
- Crossunder (`crossunder`): True if Left crossed below Right:
  $$\text{LatestLeft} \le \text{LatestRight} \ \land \ \text{PreviousLeft} > \text{PreviousRight}$$

---

## 2. Complete Technical Indicator Catalog (with Delta and Delta-Sq)

Operands follow the format `<timeframe>:<indicator>` (e.g. `30m:rsi14`). Every indicator has **Delta ($\Delta$)** and **Delta-Sq ($\Delta^2$)** acceleration versions.
- **Delta ($\Delta$)**: $V_t - V_{t-1}$ (change since last candle).
- **Delta Square ($\Delta^2$)**: $(V_t - V_{t-1}) - (V_{t-1} - V_{t-2})$ (change in acceleration).

### 1. Basic Price & Volume Metrics
- **`close`** (or **`ltp`**): Last Traded Price.
  - *Delta (`deltaClose`)*: Price change. E.g. `if 5m:deltaClose > 10 then ...`
  - *Delta-Sq (`deltaSqClose`)*: Price acceleration. E.g. `if 15m:deltaSqClose > 0 then ...`
- **`open`**: Candle open price.
- **`high`**: Candle high price.
- **`low`**: Candle low price.
- **`volume`**: Volume traded in the candle.
  - *Delta (`deltaVolume`)*: Volume change. E.g. `if 5m:deltaVolume > 5000 then ...`

---

### 2. Simple Moving Averages (SMA)
Calculates the arithmetic mean of closing prices over $N$ periods.

- **SMA 20 (`sma20` / `deltaSma20` / `deltaSqSma20`)**
  - *Description*: Standard short-term moving average.
  - *Example*: `if 5m:close > 5m:sma20 then score = score + 10 fi`
- **SMA 50 (`sma50` / `deltaSma50` / `deltaSqSma50`)**
  - *Description*: Medium-term support/resistance filter.
  - *Example*: `if 15m:sma20 crossover 15m:sma50 then score = score + 50 fi`
- **SMA 100 (`sma100` / `deltaSma100` / `deltaSqSma100`)**
  - *Description*: Intermediate trend baseline.
  - *Example*: `if 1h:close > 1h:sma100 then score = score + 30 fi`
- **SMA 200 (`sma200` / `deltaSma200` / `deltaSqSma200`)**
  - *Description*: Long-term market cycle boundary.
  - *Example*: `if 1d:close > 1d:sma200 then score = score + 100 fi`

---

### 3. Exponential Moving Averages (EMA)
Similar to SMA but applies more weight to recent prices for faster reaction times.

- **EMA 20 (`ema20` / `deltaEma20` / `deltaSqEma20`)**
  - *Description*: Reactive short-term trend filter.
  - *Example*: `if 5m:deltaEma20 > 0.5 then score = score + 15 fi`
- **EMA 50 (`ema50` / `deltaEma50` / `deltaSqEma50`)**
  - *Description*: Medium-term trend anchor.
  - *Example*: `if 30m:ema20 crossover 30m:ema50 then score = score + 80 fi`
- **EMA 100 (`ema100` / `deltaEma100` / `deltaSqEma100`)**
  - *Description*: Major intermediate institutional trend level.
  - *Example*: `if 1d:close > 1d:ema100 then score = score + 50 fi`
- **EMA 200 (`ema200` / `deltaEma200` / `deltaSqEma200`)**
  - *Description*: Ultimate bull/bear baseline.
  - *Example*: `if 1d:deltaEma200 > 0 then score = score + 120 fi`

---

### 4. Relative Strength Index (RSI)
A momentum oscillator measuring the speed and change of price movements between 0 and 100.

- **RSI 14 (`rsi14` / `deltaRsi14` / `deltaSqRsi14`)**
  - *Description*: Evaluates overbought (>70) and oversold (<30) conditions.
  - *Example*: `if 15m:rsi14 < 30 then score = score + 40 fi`
  - *Delta Example*: `if 5m:deltaRsi14 > 5 then score = score + 20 fi` (Detecting rapid momentum changes).

---

### 5. Bollinger Bands (BB)
Volatily bands placed above and below a moving average.

- **Upper Band (`bbUpper` / `deltaBbUpper` / `deltaSqBbUpper`)**
  - *Description*: High volatility resistance boundary.
  - *Example*: `if 5m:close crossover 5m:bbUpper then score = score - 30 fi`
- **Middle Band (`bbMiddle` / `deltaBbMiddle` / `deltaSqBbMiddle`)**
  - *Description*: Mean reversion baseline (20 SMA).
  - *Example*: `if 15m:close crossover 15m:bbMiddle then score = score + 20 fi`
- **Lower Band (`bbLower` / `deltaBbLower` / `deltaSqBbLower`)**
  - *Description*: High volatility support boundary.
  - *Example*: `if 5m:close crossunder 5m:bbLower then score = score + 50 fi`

---

### 6. MACD (Moving Average Convergence Divergence)
Trend-following momentum indicator showing the relationship between two EMAs.

- **MACD Line (`macdLine` / `deltaMACD` / `deltaSqMacdLine`)**
  - *Description*: Represents the difference between the 12 EMA and 26 EMA.
  - *Example*: `if 1d:macdLine > 0 then score = score + 40 fi`
- **Signal Line (`macdSignal` / `deltaMacdSignal` / `deltaSqMacdSignal`)**
  - *Description*: 9 EMA of the MACD line.
  - *Example*: `if 1d:macdLine crossover 1d:macdSignal then score = score + 100 fi`
- **Histogram (`macdHist` / `deltaMacdHist` / `deltaSqMacdHist`)**
  - *Description*: Visualizes the distance between the MACD Line and the Signal Line.
  - *Example*: `if 30m:deltaMacdHist > 0 then score = score + 30 fi`

---

### 7. Average Directional Index & Directional Movement (ADX / DMI)
Trend strength and direction indicators.

- **ADX (`adx` / `deltaADX` / `deltaSqADX`)**
  - *Description*: Measures overall strength of the trend (value >25 indicates a strong trend).
  - *Example*: `if 1h:adx > 25 then score = score + 25 fi`
- **Plus DI (`plusDI` / `deltaPlusDI` / `deltaSqPlusDI`)**
  - *Description*: Measures positive trend direction.
  - *Example*: `if 1h:plusDI crossover 1h:minusDI then score = score + 60 fi`
- **Minus DI (`minusDI` / `deltaMinusDI` / `deltaSqMinusDI`)**
  - *Description*: Measures negative trend direction.
  - *Example*: `if 1h:minusDI crossover 1h:plusDI then score = score - 60 fi`

---

### 8. Money Flow Index (MFI)
A volume-weighted momentum oscillator measuring buying and selling pressure.

- **MFI 14 (`mfi14` / `deltaMfi14` / `deltaSqMfi14`)**
  - *Description*: Volume-weighted version of RSI. Overbought (>80), oversold (<20).
  - *Example*: `if 1d:mfi14 < 20 then score = score + 70 fi`

---

### 9. Stochastic Momentum Index (SMI)
A refined version of the classic Stochastic Oscillator indicating overbought/oversold relative to EMA center.

- **SMI Line (`smiLine` / `deltaSMI` / `deltaSqSmiLine`)**
  - *Description*: The primary Stochastic Momentum index line.
  - *Example*: `if 5m:smiLine < -40 then score = score + 30 fi`
- **SMI Signal (`smiSignal` / `deltaSqSmiSignal` / `deltaSMISignal`)**
  - *Description*: SMA of the SMI line.
  - *Example*: `if 5m:smiLine crossover 5m:smiSignal then score = score + 80 fi`
- **SMI Distance (`smiDist` / `deltaSMIDist` / `deltaSqSMIDist`)**
  - *Description*: Spread between SMI Line and SMI Signal.
  - *Example*: `if 5m:deltaSMIDist > 0 then score = score + 15 fi`

---

## 3. Practical Platform Integration Examples

### 1. Watchlist Custom Scoring Script
Computes a comprehensive score based on daily trend alignment, momentum acceleration, and volatility squeeze:
```
if 1d:macdLine > 0 then score = score + 50 fi if 1d:rsi14 crossover 30 then score = score + 100 fi if 5m:deltaSqClose > 2.5 then score = score + 30 fi score = score + ( 30m:ema20 - 30m:ema50 ) * 100 / 30m:ema50
```

### 2. Backtesting Strategy Buy/Sell Configuration
- **Buy Conditions (OR joined groups of AND rules)**:
  - *Group 1*: `5m:smiLine < -30` AND `5m:ema20 > 5m:ema50`
  - *Group 2*: `5m:macdLine < 0` AND `5m:deltaMACD > 0`
- **Sell / Partial Profit Conditions**:
  - *Target 1*: Sell **40%** of current capital if `5m:rsi14 > 75`
  - *Target 2*: Sell **30%** of remaining capital if `5m:rsi14 > 83`
  - *Target 3*: Sell **100%** of remaining capital if `5m:rsi14 > 90`

### 3. Auto Trading Rule Configuration
Deploy live templates matching the exact trigger criteria of your backtested results:
```
if 15m:plusDI crossover 15m:minusDI then score = 100 else score = 0 fi
```

### 4. Real-Time Watchlist Alert Criterion
Triggers alert notifications instantly when a fast moving average accelerates through a slow baseline:
```
5m:ema20 crossover 5m:ema50
```
