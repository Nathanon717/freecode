def max_fill(grid, capacity):
    """
    Calculate the number of times a bucket of given capacity needs to be lowered to empty all wells in the grid.

    Args:
        grid (List[List[int]]): A rectangular grid where each row represents a well and each 1 represents a unit of water.
        capacity (int): The capacity of the bucket.

    Returns:
        int: The number of times the bucket needs to be lowered.

    Examples:
        >>> max_fill([[0,0,1,0], [0,1,0,0], [1,1,1,1]], 1)
        6
        >>> max_fill([[0,0,1,1], [0,0,0,0], [1,1,1,1], [0,1,1,1]], 2)
        5
        >>> max_fill([[0,0,0], [0,0,0]], 5)
        0
    """
    total_operations = 0
    for well in grid:
        water_units = sum(well)
        if water_units == 0:
            continue
        operations = water_units // capacity
        if water_units % capacity != 0:
            operations += 1
        total_operations += operations
    return total_operations