const formula = `if 1d:macdLine < 0 then score = score - 100 fi if 1d:smiLine < 1d:smiSignal then score = score - 50 fi if 30m:ema50 > 0 then score = score + ( 30m:ema20 - 30m:ema50 ) * 100 / 30m:ema50 fi if 30m:mfi14 < 40 then if 30m:deltaMfi14 > 0 then score = score + 100 fi score = score + ( 40 - 30m:mfi14 ) * 2 fi if 30m:smiLine < - 40 then if 30m:smiLine crossover 30m:smiSignal then score = score + 100 else score = score + ( ( 30m:smiLine * - 1 ) - 40 ) / 2 fi fi if 30m:adx > 0 then if 30m:plusDI > 30m:minusDI then if 30m:deltaDI != 0 then score = score + ( 30m:deltaDI / ( ( 30m:plusDI - 30m:minusDI ) * 30m:adx ) ) * 1000 fi fi fi`;

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
    if (op !== '(' && op !== ')') outputQueue.push(op);
  }
  return outputQueue;
}

function evaluatePostfix(postfixTokens) {
  const stack = [];
  for (const token of postfixTokens) {
    if (typeof token === 'number') {
      stack.push(token);
    } else if (isOperator(token)) {
      if (stack.length < 2) return 0;
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

// -------------------------------------------------------------
// SCENARIO 1: Indicators are completely empty (not fetched yet)
// -------------------------------------------------------------
const emptyIndicators = {};
const emptyQuotes = {};

function getIndicatorValueEmpty(stockKey, tf, type, valOrIndicator, isPrev = false) {
  if (type === 'value') return parseFloat(valOrIndicator || 0);
  const indicatorName = valOrIndicator;
  const quote = emptyQuotes[stockKey];
  
  if (isPrev === false) {
    if (indicatorName === 'close' || indicatorName === 'ltp') return quote?.ltp ?? 0;
    if (indicatorName === 'open') return quote?.open ?? 0;
    if (indicatorName === 'high') return quote?.high ?? 0;
    if (indicatorName === 'low') return quote?.low ?? 0;
    if (indicatorName === 'volume') return quote?.volume ?? 0;
  }

  const indObj = emptyIndicators[`${stockKey}:${tf}`];
  if (!indObj) return 0;
  
  const arr = indObj[indicatorName];
  if (!arr || !Array.isArray(arr) || arr.length === 0) return 0;
  const targetIdx = isPrev ? arr.length - 2 : arr.length - 1;
  const value = arr[targetIdx];
  return value != null && !isNaN(value) ? value : 0;
}

const evaluateSubExpr = (toks, currentScore, isPrev) => {
  const resolved = toks.map(t => {
    if (t.type === 'keyword' && t.valueStr === 'score') return currentScore;
    if (t.type === 'operand') {
      if (t.valueType === 'value') return parseFloat(t.value ?? 0);
      return getIndicatorValueEmpty('NSE:THYROCARE', t.timeframe, 'indicator', t.indicator, isPrev);
    }
    return t.valueStr || t.raw;
  });
  const postfix = infixToPostfix(resolved);
  return evaluatePostfix(postfix);
};

const evaluateConditionExpr = (exprTokens, currentScore) => {
  const compOps = ['crossover', 'crossunder', '>=', '<=', '==', '!=', '>', '<'];
  let compOpIdx = -1;
  let compOp = null;
  for (let i = 0; i < exprTokens.length; i++) {
    const rawLower = exprTokens[i].valueStr
      ? exprTokens[i].valueStr.toLowerCase()
      : exprTokens[i].raw
      ? exprTokens[i].raw.toLowerCase()
      : String(exprTokens[i]).toLowerCase();
    if (compOps.includes(rawLower)) {
      compOpIdx = i;
      compOp = rawLower;
      break;
    }
  }
  if (compOpIdx !== -1) {
    const leftTokens = exprTokens.slice(0, compOpIdx);
    const rightTokens = exprTokens.slice(compOpIdx + 1);
    const latestLeft = evaluateSubExpr(leftTokens, currentScore, false);
    const prevLeft = evaluateSubExpr(leftTokens, currentScore, true);
    const latestRight = evaluateSubExpr(rightTokens, currentScore, false);
    const prevRight = evaluateSubExpr(rightTokens, currentScore, true);
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
  return evaluateSubExpr(exprTokens, currentScore, false);
};

const tokens = parseFormulaString(formula);
const statements = parseTokensToAST(tokens);

let score = 0;
const run = (stmtList) => {
  for (const stmt of stmtList) {
    if (stmt.type === 'assignment') {
      score = evaluateConditionExpr(stmt.expression, score);
    } else if (stmt.type === 'expression') {
      score = evaluateConditionExpr(stmt.expression, score);
    } else if (stmt.type === 'if') {
      let conditionMet = false;
      for (const branch of stmt.branches) {
        if (evaluateConditionExpr(branch.condition, score)) {
          run(branch.body);
          conditionMet = true;
          break;
        }
      }
      if (!conditionMet && stmt.elseBody) run(stmt.elseBody);
    }
  }
};

run(statements);
console.log('Evaluated score for empty indicators:', score);
