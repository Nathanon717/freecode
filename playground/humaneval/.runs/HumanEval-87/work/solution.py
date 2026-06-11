from typing import List, Tuple

def get_row(lst: List[List[int]], x: int) -> List[Tuple[int, int]]:
    result = []
    for row_idx, row in enumerate(lst):
        # Find all occurrences of x in the current row
        cols = [col_idx for col_idx, val in enumerate(row) if val == x]
        # Sort columns in descending order
        cols.sort(reverse=True)
        # Create tuples and add to result
        for col_idx in cols:
            result.append((row_idx, col_idx))
    return result