import assert from 'node:assert/strict';

import { parseEditableNumberInput, resolveEditableNumberBlurValue } from './editableNumber';

const emptyStrike = parseEditableNumberInput('', 0.01);
assert.equal(emptyStrike.displayValue, '');
assert.equal(emptyStrike.shouldCommit, false);
assert.equal(emptyStrike.parsedValue, undefined);

const partialDecimal = parseEditableNumberInput('.', 0.01);
assert.equal(partialDecimal.displayValue, '.');
assert.equal(partialDecimal.shouldCommit, false);

const validStrike = parseEditableNumberInput('310.5', 0.01);
assert.equal(validStrike.displayValue, '310.5');
assert.equal(validStrike.shouldCommit, true);
assert.equal(validStrike.parsedValue, 310.5);

const belowMinQuantity = parseEditableNumberInput('0', 1);
assert.equal(belowMinQuantity.shouldCommit, false);

assert.equal(resolveEditableNumberBlurValue('', 310), '310');
assert.equal(resolveEditableNumberBlurValue('.', 160.86), '160.86');
assert.equal(resolveEditableNumberBlurValue('315', 310), '315');

console.log('editableNumber tests passed');
