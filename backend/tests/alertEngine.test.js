// ─────────────────────────────────────────────────────────────────────────────
// backend/tests/alertEngine.test.js
// ─────────────────────────────────────────────────────────────────────────────
const { evaluateCondition } = require('../services/alertEngine');

let passedTests = 0;
let failedTests = 0;

function assert(description, actual, expected) {
  if (actual === expected) {
    console.log(`✅ PASS: ${description}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${description}\n   Expected: ${expected}\n   Actual:   ${actual}`);
    failedTests++;
  }
}

console.log('🧪 Running alertEngine Crossover/Crossunder unit tests...\n');

// ── 1. CROSSOVER (Indicator vs Indicator) ────────────────────────────────────
console.log('--- 1. Crossover (Indicator vs Indicator) ---');

// Case 1: First indicator crosses over second indicator (successful crossover)
// prev: left=10, right=12; latest: left=15, right=13
assert(
  'crossover (ind vs ind) - crosses over successfully',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossover', rightType: 'indicator', rightIndicator: 'mfi14' },
    {
      latest: { rsi14: 15, mfi14: 13 },
      prev: { rsi14: 10, mfi14: 12 }
    }
  ),
  true
);

// Case 2: First indicator was already above second indicator (no crossover)
// prev: left=15, right=14; latest: left=16, right=15
assert(
  'crossover (ind vs ind) - already above previously',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossover', rightType: 'indicator', rightIndicator: 'mfi14' },
    {
      latest: { rsi14: 16, mfi14: 15 },
      prev: { rsi14: 15, mfi14: 14 }
    }
  ),
  false
);

// Case 3: First indicator crosses over second and lands exactly equal
// prev: left=10, right=12; latest: left=13, right=13
assert(
  'crossover (ind vs ind) - crosses over to exactly equal',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossover', rightType: 'indicator', rightIndicator: 'mfi14' },
    {
      latest: { rsi14: 13, mfi14: 13 },
      prev: { rsi14: 10, mfi14: 12 }
    }
  ),
  true
);

// Case 4: First indicator is below second indicator (no crossover)
// prev: left=9, right=12; latest: left=11, right=13
assert(
  'crossover (ind vs ind) - remains below',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossover', rightType: 'indicator', rightIndicator: 'mfi14' },
    {
      latest: { rsi14: 11, mfi14: 13 },
      prev: { rsi14: 9, mfi14: 12 }
    }
  ),
  false
);


// ── 2. CROSSOVER (Indicator vs Value) ────────────────────────────────────────
console.log('\n--- 2. Crossover (Indicator vs Value) ---');

// Case 1: First indicator crosses over value (successful crossover)
// prev: left=10, value=12; latest: left=15, value=12
assert(
  'crossover (ind vs val) - crosses over successfully',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossover', rightType: 'value', rightValue: 12 },
    {
      latest: { rsi14: 15 },
      prev: { rsi14: 10 }
    }
  ),
  true
);

// Case 2: First indicator was already above value (no crossover)
// prev: left=15, value=12; latest: left=16, value=12
assert(
  'crossover (ind vs val) - already above previously',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossover', rightType: 'value', rightValue: 12 },
    {
      latest: { rsi14: 16 },
      prev: { rsi14: 15 }
    }
  ),
  false
);

// Case 3: First indicator crosses over value and lands exactly equal
// prev: left=10, value=12; latest: left=12, value=12
assert(
  'crossover (ind vs val) - crosses over to exactly equal',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossover', rightType: 'value', rightValue: 12 },
    {
      latest: { rsi14: 12 },
      prev: { rsi14: 10 }
    }
  ),
  true
);

// Case 4: First indicator is below value (no crossover)
// prev: left=9, value=12; latest: left=11, value=12
assert(
  'crossover (ind vs val) - remains below',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossover', rightType: 'value', rightValue: 12 },
    {
      latest: { rsi14: 11 },
      prev: { rsi14: 9 }
    }
  ),
  false
);


// ── 3. CROSSUNDER (Indicator vs Indicator) ───────────────────────────────────
console.log('\n--- 3. Crossunder (Indicator vs Indicator) ---');

// Case 1: First indicator crosses under second indicator (successful crossunder)
// prev: left=15, right=13; latest: left=12, right=14
assert(
  'crossunder (ind vs ind) - crosses under successfully',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossunder', rightType: 'indicator', rightIndicator: 'mfi14' },
    {
      latest: { rsi14: 12, mfi14: 14 },
      prev: { rsi14: 15, mfi14: 13 }
    }
  ),
  true
);

// Case 2: First indicator was already below second indicator (no crossunder)
// prev: left=11, right=12; latest: left=13, right=14
assert(
  'crossunder (ind vs ind) - already below previously',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossunder', rightType: 'indicator', rightIndicator: 'mfi14' },
    {
      latest: { rsi14: 13, mfi14: 14 },
      prev: { rsi14: 11, mfi14: 12 }
    }
  ),
  false
);

// Case 3: First indicator crosses under second and lands exactly equal
// prev: left=15, right=13; latest: left=13, right=13
assert(
  'crossunder (ind vs ind) - crosses under to exactly equal',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossunder', rightType: 'indicator', rightIndicator: 'mfi14' },
    {
      latest: { rsi14: 13, mfi14: 13 },
      prev: { rsi14: 15, mfi14: 13 }
    }
  ),
  true
);

// Case 4: First indicator is above second indicator (no crossunder)
// prev: left=15, right=12; latest: left=14, right=13
assert(
  'crossunder (ind vs ind) - remains above',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossunder', rightType: 'indicator', rightIndicator: 'mfi14' },
    {
      latest: { rsi14: 14, mfi14: 13 },
      prev: { rsi14: 15, mfi14: 12 }
    }
  ),
  false
);


// ── 4. CROSSUNDER (Indicator vs Value) ───────────────────────────────────────
console.log('\n--- 4. Crossunder (Indicator vs Value) ---');

// Case 1: First indicator crosses under value (successful crossunder)
// prev: left=15, value=12; latest: left=10, value=12
assert(
  'crossunder (ind vs val) - crosses under successfully',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossunder', rightType: 'value', rightValue: 12 },
    {
      latest: { rsi14: 10 },
      prev: { rsi14: 15 }
    }
  ),
  true
);

// Case 2: First indicator was already below value (no crossunder)
// prev: left=11, value=12; latest: left=10, value=12
assert(
  'crossunder (ind vs val) - already below previously',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossunder', rightType: 'value', rightValue: 12 },
    {
      latest: { rsi14: 10 },
      prev: { rsi14: 11 }
    }
  ),
  false
);

// Case 3: First indicator crosses under value and lands exactly equal
// prev: left=15, value=12; latest: left=12, value=12
assert(
  'crossunder (ind vs val) - crosses under to exactly equal',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossunder', rightType: 'value', rightValue: 12 },
    {
      latest: { rsi14: 12 },
      prev: { rsi14: 15 }
    }
  ),
  true
);

// Case 4: First indicator is above value (no crossunder)
// prev: left=15, value=12; latest: left=13, value=12
assert(
  'crossunder (ind vs val) - remains above',
  evaluateCondition(
    { leftIndicator: 'rsi14', operator: 'crossunder', rightType: 'value', rightValue: 12 },
    {
      latest: { rsi14: 13 },
      prev: { rsi14: 15 }
    }
  ),
  false
);

console.log('\n--- Summary ---');
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('\n🎉 All crossover/crossunder unit tests passed successfully!');
  process.exit(0);
}
