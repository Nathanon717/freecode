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