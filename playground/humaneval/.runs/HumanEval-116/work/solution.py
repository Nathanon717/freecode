def sort_array(arr):
    """
    Sorts an array of integers based on the number of ones in their binary representation.
    For numbers with the same number of ones, sorts by decimal value.

    Args:
    arr: List of integers to be sorted

    Returns:
    List of sorted integers
    """
    def count_ones(n):
        return bin(n).count('1')

    return sorted(arr, key=lambda x: (count_ones(x), x))