export type DiffEntry = { type: 'equal' | 'remove' | 'add'; text: string };

export function computeLineDiff(
  oldLines: string[],
  newLines: string[],
): DiffEntry[] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from(
    { length: m + 1 },
    () => new Array(n + 1).fill(0) as number[],
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        oldLines[i] === newLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: DiffEntry[] = [];
  let i = 0,
    j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ type: 'equal', text: oldLines[i] });
      i++;
      j++;
    } else if (i < m && (j >= n || dp[i + 1][j] >= dp[i][j + 1])) {
      result.push({ type: 'remove', text: oldLines[i] });
      i++;
    } else {
      result.push({ type: 'add', text: newLines[j] });
      j++;
    }
  }
  return result;
}
