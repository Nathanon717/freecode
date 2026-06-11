import heapq
from typing import List

def minPath(grid: List[List[int]], k: int) -> List[int]:
    N = len(grid)
    
    # Directions for moving to neighbor cells (up, down, left, right)
    directions = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    
    # Priority queue to store paths: (current_path, last_position)
    # We use a tuple to make it hashable and comparable
    heap = []
    
    # Initialize the heap with all possible starting positions
    for i in range(N):
        for j in range(N):
            heapq.heappush(heap, ([grid[i][j]], (i, j)))
    
    # To avoid revisiting the same path, we keep track of visited paths
    visited = set()
    
    while heap:
        current_path, last_pos = heapq.heappop(heap)
        
        if len(current_path) == k:
            return current_path
        
        # Generate all possible next positions
        i, j = last_pos
        for di, dj in directions:
            ni, nj = i + di, j + dj
            if 0 <= ni < N and 0 <= nj < N:
                new_path = current_path + [grid[ni][nj]]
                new_path_tuple = tuple(new_path)
                if new_path_tuple not in visited:
                    visited.add(new_path_tuple)
                    heapq.heappush(heap, (new_path, (ni, nj)))
    
    # In case k is 1, the smallest element in the grid is the answer
    return [min(min(row) for row in grid)]
def check(candidate):

    # Check some simple cases
    print
    assert candidate([[1, 2, 3], [4, 5, 6], [7, 8, 9]], 3) == [1, 2, 1]
    assert candidate([[5, 9, 3], [4, 1, 6], [7, 8, 2]], 1) == [1]
    assert candidate([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]], 4) == [1, 2, 1, 2]
    assert candidate([[6, 4, 13, 10], [5, 7, 12, 1], [3, 16, 11, 15], [8, 14, 9, 2]], 7) == [1, 10, 1, 10, 1, 10, 1]
    assert candidate([[8, 14, 9, 2], [6, 4, 13, 15], [5, 7, 1, 12], [3, 10, 11, 16]], 5) == [1, 7, 1, 7, 1]
    assert candidate([[11, 8, 7, 2], [5, 16, 14, 4], [9, 3, 15, 6], [12, 13, 10, 1]], 9) == [1, 6, 1, 6, 1, 6, 1, 6, 1]
    assert candidate([[12, 13, 10, 1], [9, 3, 15, 6], [5, 16, 14, 4], [11, 8, 7, 2]], 12) == [1, 6, 1, 6, 1, 6, 1, 6, 1, 6, 1, 6]
    assert candidate([[2, 7, 4], [3, 1, 5], [6, 8, 9]], 8) == [1, 3, 1, 3, 1, 3, 1, 3]
    assert candidate([[6, 1, 5], [3, 8, 9], [2, 7, 4]], 8) == [1, 5, 1, 5, 1, 5, 1, 5]

    # Check some edge cases that are easy to work out by hand.
    assert candidate([[1, 2], [3, 4]], 10) == [1, 2, 1, 2, 1, 2, 1, 2, 1, 2]
    assert candidate([[1, 3], [3, 2]], 10) == [1, 3, 1, 3, 1, 3, 1, 3, 1, 3]


check(minPath)
