def order_by_points(nums):
    """
    Sorts a list of integers based on the sum of their digits.

    Args:
    nums: List of integers to be sorted.

    Returns:
    List of integers sorted by the sum of their digits, with ties broken by original order.
    """
    def digit_sum(n):
        """Helper function to calculate the sum of digits of an integer."""
        return sum(int(d) for d in str(abs(n)))

    # Create a list of tuples containing the digit sum and the original index
    decorated = [(digit_sum(num), i, num) for i, num in enumerate(nums)]
    # Sort the list based on the digit sum and then the original index
    decorated.sort()
    # Extract the sorted numbers in the new order
    return [num for (sum_digits, i, num) in decorated]