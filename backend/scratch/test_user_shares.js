const validIndicatorsForParsing = new Set([
  'close', 'open', 'high', 'low', 'volume',
  'sma20', 'deltaSma20', 'deltaSqSma20', 'sma50', 'deltaSma50', 'deltaSqSma50', 'sma100', 'deltaSma100', 'deltaSqSma100', 'sma200', 'deltaSma200', 'deltaSqSma200',
  'ema20', 'deltaEma20', 'deltaSqEma20', 'ema50', 'deltaEma50', 'deltaSqEma50', 'ema100', 'deltaEma100', 'deltaSqEma100', 'ema200', 'deltaEma200', 'deltaSqEma200',
  'rsi14', 'deltaRsi14', 'deltaSqRsi14',
  'bbUpper', 'deltaBbUpper', 'deltaSqBbUpper', 'bbMiddle', 'deltaBbMiddle', 'deltaSqBbMiddle', 'bbLower', 'deltaBbLower', 'deltaSqBbLower',
  'macdLine', 'deltaMACD', 'deltaSqMacdLine', 'macdSignal', 'deltaMacdSignal', 'deltaSqMacdSignal', 'macdHist', 'deltaMacdHist', 'deltaSqMacdHist',
  'adx', 'deltaADX', 'deltaSqADX', 'plusDI', 'deltaPlusDI', 'deltaSqPlusDI', 'minusDI', 'deltaMinusDI', 'deltaSqMinusDI', 'di', 'deltaDI', 'deltaSqDI',
  'mfi14', 'deltaMfi14', 'deltaSqMfi14',
  'smiLine', 'deltaSMI', 'deltaSqSmiLine', 'smiSignal', 'deltaSMISignal', 'deltaSqSmiSignal', 'smiDist', 'deltaSMIDist', 'deltaSqSMIDist'
]);

function parseFormulaString(formulaStr) {
  const regex = /(\(|\)|<=|>=|==|!=|<|>|=|\+|-|\*|\/|[^\s()+\-*/<>=!]+)/g;
  const rawTokens = formulaStr.match(regex) || [];
  
  const tokens = [];
  for (const raw of rawTokens) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();

    if (['if', 'then', 'else', 'elseif', 'fi', 'score'].includes(lower)) {
      tokens.push({ type: 'keyword', valueStr: lower });
    } else if (['(', ')'].includes(trimmed)) {
      tokens.push({ type: 'parenthesis', valueStr: trimmed });
    } else if (['+', '-', '*', '/'].includes(trimmed)) {
      tokens.push({ type: 'operator', valueStr: trimmed });
    } else if (['<=', '>=', '==', '!=', '<', '>', 'crossover', 'crossunder'].includes(lower)) {
      tokens.push({ type: 'comparison', valueStr: lower });
    } else if (trimmed === '=') {
      tokens.push({ type: 'assignment', valueStr: '=' });
    } else {
      if (!isNaN(trimmed)) {
        tokens.push({ type: 'operand', valueType: 'value', value: parseFloat(trimmed) });
      } else {
        let timeframe = '5m';
        let indicatorName = trimmed;
        if (trimmed.includes(':')) {
          const parts = trimmed.split(':');
          timeframe = parts[0];
          indicatorName = parts[1];
        }

        if (!validIndicatorsForParsing.has(indicatorName)) {
          throw new Error(`Unknown indicator name: "${indicatorName}"`);
        }

        tokens.push({
          type: 'operand',
          valueType: 'indicator',
          timeframe,
          indicator: indicatorName
        });
      }
    }
  }
  const mergedTokens = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const current = tokens[idx];
    if (
      current.type === 'operator' && current.valueStr === '-' &&
      idx + 1 < tokens.length &&
      tokens[idx + 1].type === 'operand' && tokens[idx + 1].valueType === 'value'
    ) {
      const prev = mergedTokens[mergedTokens.length - 1];
      const isUnary = !prev || 
                      prev.type === 'operator' || 
                      prev.type === 'comparison' || 
                      prev.type === 'assignment' || 
                      (prev.type === 'parenthesis' && prev.valueStr === '(') ||
                      (prev.type === 'keyword' && ['then', 'else', 'elseif'].includes(prev.valueStr));
      
      if (isUnary) {
        const nextVal = tokens[idx + 1];
        mergedTokens.push({
          type: 'operand',
          valueType: 'value',
          value: -nextVal.value
        });
        idx++;
        continue;
      }
    }
    mergedTokens.push(current);
  }
  return mergedTokens;
}

const parseTokensToAST = (tokens) => {
  let i = 0;

  function parseStatements() {
    const statements = [];
    while (i < tokens.length) {
      const token = tokens[i];
      if (token.type === 'keyword' && ['elseif', 'else', 'fi'].includes(token.valueStr)) {
        break;
      }
      statements.push(parseStatement());
    }
    return statements;
  }

  function parseStatement() {
    const token = tokens[i];
    if (token && token.type === 'keyword' && token.valueStr === 'if') {
      i++; // consume 'if'
      const conditionTokens = [];
      while (i < tokens.length && !(tokens[i].type === 'keyword' && tokens[i].valueStr === 'then')) {
        conditionTokens.push(tokens[i]);
        i++;
      }
      if (i < tokens.length) i++; // consume 'then'

      const branches = [{ condition: conditionTokens, body: null }];
      branches[0].body = parseStatements();

      let elseBody = null;
      while (i < tokens.length && tokens[i].type === 'keyword' && tokens[i].valueStr === 'elseif') {
        i++; // consume 'elseif'
        const elifCond = [];
        while (i < tokens.length && !(tokens[i].type === 'keyword' && tokens[i].valueStr === 'then')) {
          elifCond.push(tokens[i]);
          i++;
        }
        if (i < tokens.length) i++; // consume 'then'
        const elifBody = parseStatements();
        branches.push({ condition: elifCond, body: elifBody });
      }

      if (i < tokens.length && tokens[i].type === 'keyword' && tokens[i].valueStr === 'else') {
        i++; // consume 'else'
        elseBody = parseStatements();
      }

      if (i < tokens.length && tokens[i].type === 'keyword' && tokens[i].valueStr === 'fi') {
        i++; // consume 'fi'
      }

      return { type: 'if', branches, elseBody };
    }

    if (token && token.type === 'keyword' && token.valueStr === 'score' && i + 1 < tokens.length && tokens[i + 1].type === 'assignment') {
      i += 2; // consume 'score' and '='
      const exprTokens = [];
      while (i < tokens.length) {
        const nextT = tokens[i];
        if (nextT.type === 'keyword') {
          if (['if', 'elseif', 'else', 'fi'].includes(nextT.valueStr)) {
            break;
          }
          if (nextT.valueStr === 'score' && i + 1 < tokens.length && tokens[i + 1].type === 'assignment') {
            break;
          }
        }
        exprTokens.push(nextT);
        i++;
      }
      return { type: 'assignment', expression: exprTokens };
    }

    const exprTokens = [];
    while (i < tokens.length) {
      const nextT = tokens[i];
      if (nextT.type === 'keyword' && ['if', 'elseif', 'else', 'fi'].includes(nextT.valueStr)) {
        break;
      }
      if (nextT.type === 'keyword' && nextT.valueStr === 'score' && i + 1 < tokens.length && tokens[i + 1].type === 'assignment') {
        break;
      }
      exprTokens.push(nextT);
      i++;
    }
    return { type: 'expression', expression: exprTokens };
  }

  return parseStatements();
};

const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };
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
  return stack.length > 0 ? stack[0] : 0;
}

const mockShares = [
  {
    name: 'Share A (Bullish Trend, High DI)',
    indicators: {
      '1d:macdLine': { latest: 5, prev: 4 },
      '1d:smiLine': { latest: 10, prev: 8 },
      '1d:smiSignal': { latest: 5, prev: 4 },
      '30m:ema50': { latest: 100, prev: 99 },
      '30m:ema20': { latest: 105, prev: 104 },
      '30m:mfi14': { latest: 50, prev: 48 },
      '30m:deltaMfi14': { latest: 2, prev: 1 },
      '30m:smiLine': { latest: -20, prev: -22 },
      '30m:smiSignal': { latest: -25, prev: -27 },
      '30m:adx': { latest: 30, prev: 28 },
      '30m:plusDI': { latest: 35, prev: 33 },
      '30m:minusDI': { latest: 20, prev: 21 },
      '30m:deltaDI': { latest: 3, prev: 1 }
    }
  },
  {
    name: 'Share B (Oversold, SMI Crossover)',
    indicators: {
      '1d:macdLine': { latest: -2.5, prev: -3.0 },
      '1d:smiLine': { latest: -15, prev: -12 },
      '1d:smiSignal': { latest: -10, prev: -9 },
      '30m:ema50': { latest: 200, prev: 201 },
      '30m:ema20': { latest: 198, prev: 197 },
      '30m:mfi14': { latest: 35, prev: 32 },
      '30m:deltaMfi14': { latest: 3, prev: 1 },
      '30m:smiLine': { latest: -45, prev: -52 },
      '30m:smiSignal': { latest: -48, prev: -46 },
      '30m:adx': { latest: 0, prev: 0 },
      '30m:plusDI': { latest: 10, prev: 9 },
      '30m:minusDI': { latest: 15, prev: 16 },
      '30m:deltaDI': { latest: 0, prev: 0 }
    }
  },
  {
    name: 'Share C (Bearish and Falling)',
    indicators: {
      '1d:macdLine': { latest: -1.2, prev: -1.0 },
      '1d:smiLine': { latest: 5, prev: 6 },
      '1d:smiSignal': { latest: 8, prev: 7 },
      '30m:ema50': { latest: 0, prev: 0 },
      '30m:ema20': { latest: 10, prev: 10 },
      '30m:mfi14': { latest: 25, prev: 27 },
      '30m:deltaMfi14': { latest: -2, prev: -1 },
      '30m:smiLine': { latest: -50, prev: -48 },
      '30m:smiSignal': { latest: -60, prev: -58 },
      '30m:adx': { latest: 20, prev: 18 },
      '30m:plusDI': { latest: 15, prev: 16 },
      '30m:minusDI': { latest: 25, prev: 24 },
      '30m:deltaDI': { latest: -2, prev: -1 }
    }
  }
];

function runVerification() {
  const userFormula = `if 1d:macdLine < 0 then score = score - 100 fi if 1d:smiLine < 1d:smiSignal then score = score - 50 fi if 30m:ema50 > 0 then score = score + ( 30m:ema20 - 30m:ema50 ) * 100 / 30m:ema50 fi if 30m:mfi14 < 40 then if 30m:deltaMfi14 > 0 then score = score + 100 fi score = score + ( 40 - 30m:mfi14 ) * 2 fi if 30m:smiLine < - 40 then if 30m:smiLine crossover 30m:smiSignal then score = score + 100 else score = score + ( ( 30m:smiLine * - 1 ) - 40 ) / 2 fi fi if 30m:adx > 0 then if 30m:plusDI > 30m:minusDI then if 30m:deltaDI != 0 then score = score + ( 30m:deltaDI / ( ( 30m:plusDI - 30m:minusDI ) * 30m:adx ) ) * 1000 fi fi fi`;

  const tokens = parseFormulaString(userFormula);
  const ast = parseTokensToAST(tokens);

  console.log('📦 Formula parsed successfully.');

  for (const stock of mockShares) {
    console.log(`\n────────────────────────────────────────────────────────────────`);
    console.log(`📈 Testing Stock Scenario: ${stock.name}`);
    console.log(`────────────────────────────────────────────────────────────────`);

    function getVal(timeframe, indicatorName, isPrev = false) {
      const key = `${timeframe}:${indicatorName}`;
      const stateObj = stock.indicators[key];
      if (!stateObj) {
        throw new Error(`Mock indicator not found: ${key}`);
      }
      return isPrev ? stateObj.prev : stateObj.latest;
    }

    let currentScore = 0;
    const traceLog = [];

    function evalSub(subTokens, isPrev = false) {
      const resolved = subTokens.map(t => {
        if (t.type === 'keyword' && t.valueStr === 'score') {
          return currentScore;
        }
        if (t.type === 'operand') {
          if (t.valueType === 'value') {
            return parseFloat(t.value ?? 0);
          } else {
            return getVal(t.timeframe, t.indicator, isPrev);
          }
        }
        return t.valueStr || t.raw;
      });
      const pf = infixToPostfix(resolved);
      return evaluatePostfix(pf);
    }

    function evalCondition(exprTokens) {
      const compOps = ['crossover', 'crossunder', '>=', '<=', '==', '!=', '>', '<'];
      let compOpIdx = -1;
      let compOp = null;

      for (let idx = 0; idx < exprTokens.length; idx++) {
        const rawLower = exprTokens[idx].valueStr ? exprTokens[idx].valueStr.toLowerCase() : String(exprTokens[idx]).toLowerCase();
        if (compOps.includes(rawLower)) {
          compOpIdx = idx;
          compOp = rawLower;
          break;
        }
      }

      if (compOpIdx !== -1) {
        const leftTokens = exprTokens.slice(0, compOpIdx);
        const rightTokens = exprTokens.slice(compOpIdx + 1);

        const latestLeft = evalSub(leftTokens, false);
        const prevLeft = evalSub(leftTokens, true);

        const latestRight = evalSub(rightTokens, false);
        const prevRight = evalSub(rightTokens, true);

        switch (compOp) {
          case '>': return latestLeft > latestRight;
          case '>=': return latestLeft >= latestRight;
          case '==': return latestLeft == latestRight;
          case '<=': return latestLeft <= latestRight;
          case '<': return latestLeft < latestRight;
          case '!=': return latestLeft != latestRight;
          case 'crossover': return latestLeft >= latestRight && prevLeft < prevRight;
          case 'crossunder': return latestLeft <= latestRight && prevLeft > prevRight;
          default: return false;
        }
      }

      return evalSub(exprTokens, false);
    }

    function run(stmtList) {
      for (const stmt of stmtList) {
        if (stmt.type === 'assignment') {
          const nextScore = evalCondition(stmt.expression);
          traceLog.push(`Assignment: score changed from ${currentScore.toFixed(4)} to ${nextScore.toFixed(4)}`);
          currentScore = nextScore;
        } else if (stmt.type === 'if') {
          let conditionMet = false;
          for (const branch of stmt.branches) {
            const condVal = evalCondition(branch.condition);
            const condStr = branch.condition.map(c => c.valueStr || c.indicator || c.value).join(' ');
            traceLog.push(`Check branch [${condStr}] => ${condVal}`);
            if (condVal) {
              run(branch.body);
              conditionMet = true;
              break;
            }
          }
          if (!conditionMet && stmt.elseBody) {
            traceLog.push(`Executing else branch`);
            run(stmt.elseBody);
          }
        }
      }
    }

    run(ast);

    console.log(`📋 AST Execution Trace:`);
    traceLog.forEach(line => console.log(`   → ${line}`));
    console.log(`🏆 Final Score: ${currentScore.toFixed(4)}`);
  }
}

runVerification();
