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
  return tokens;
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

const mockIndicators = {
  macdLine: -5,
  smiLine: -10,
  smiSignal: -20
};

const executeStatements = (statements) => {
  let score = 0;

  function evaluateConditionExpr(exprTokens) {
    // Basic mock evaluator
    const operand = exprTokens[0];
    const op = exprTokens[1].valueStr;
    const right = exprTokens[2];

    const leftVal = mockIndicators[operand.indicator];
    const rightVal = right.type === 'operand' && right.valueType === 'value' ? right.value : mockIndicators[right.indicator];

    if (op === '<') return leftVal < rightVal;
    if (op === '>') return leftVal > rightVal;
    return false;
  }

  function run(stmtList) {
    for (const stmt of stmtList) {
      if (stmt.type === 'assignment') {
        // Mock math evaluation (e.g. score - 150)
        const op = stmt.expression[1].valueStr;
        const val = stmt.expression[2].value;
        if (op === '-') score -= val;
        else score += val;
      } else if (stmt.type === 'if') {
        let conditionMet = false;
        for (const branch of stmt.branches) {
          if (evaluateConditionExpr(branch.condition)) {
            run(branch.body);
            conditionMet = true;
            break;
          }
        }
        if (!conditionMet && stmt.elseBody) {
          run(stmt.elseBody);
        }
      }
    }
  }

  run(statements);
  return score;
};

const testNestedFormula = `
  if 1d:macdLine < 0 then
    if 1d:smiLine < 1d:smiSignal then
      score = score - 150
    else
      score = score - 50
    fi
  else
    score = score + 100
  fi
`;

const tokens = parseFormulaString(testNestedFormula);
const ast = parseTokensToAST(tokens);
console.log('AST Structure for Nested If:\n', JSON.stringify(ast, null, 2));

const score = executeStatements(ast);
console.log('\nCalculated Score (Expected: macdLine is -5 < 0, smiLine is -10 which is NOT < -20 signal, so else branch executes, score should be -50):', score);
