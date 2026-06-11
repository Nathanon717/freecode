def pluck(arr):
    """
    Given an array representing a branch of a tree that has non-negative integer nodes,
    this function plucks the node with the smallest even value.

    The plucked node is the one with the smallest even value. If multiple nodes have the same smallest even value,
    the node with the smallest index is chosen. The function returns the plucked node as a list [smallest_value, its_index].
    If there are no even values or the given array is empty, the function returns an empty list.

    Example 1:
        Input: [4,2,3]
        Output: [2, 1]
        Explanation: 2 has the smallest even value, and 2 has the smallest index.

    Example 2:
        Input: [1,2,3]
        Output: [2, 1]
        Explanation: 2 has the smallest even value, and 2 has the smallest index.

    Example 3:
        Input: []
        Output: []

    Example 4:
        Input: [5, 0, 3, 0, 4, 2]
        Output: [0, 1]
        Explanation: 0 is the smallest value, but there are two zeros,
                     so we will choose the first zero, which has the smallest index.
    """
    if not arr:
        return []
    
    smallest_even = None
    for i, num in enumerate(arr):
        if num % 2 == 0:
            if smallest_even is None or num < smallest_even[0]:
                smallest_even = [num, i]
            elif num == smallest_even[0] and i < smallest_even[1]:
                smallest_even = [num, i]
    
    return smallest_even if smallest_even is not None else []
