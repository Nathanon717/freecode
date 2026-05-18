# Challenge: bugfix-001 — Off-by-One Error

## Task

There is a bug in `broken/solution.js`. The `sum` function should return the sum of all elements in an array, but it returns the wrong result due to an off-by-one error in the loop.

## Goal

Fix the bug and write the corrected version to `solution/solution.js`.

## Verify

```js
const { sum } = require('./solution/solution');
console.log(sum([1, 2, 3, 4, 5])); // should print 15
console.log(sum([10, 20]));         // should print 30
console.log(sum([]));               // should print 0
```
