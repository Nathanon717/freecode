def intersection(interval1, interval2):
    """Check if the intersection length of two closed intervals is a prime number.

    Args:
        interval1: A tuple of two integers representing the first interval (start, end).
        interval2: A tuple of two integers representing the second interval (start, end).

    Returns:
        str: "YES" if the intersection length is a prime number, otherwise "NO".
    """
    def is_prime(n):
        """Check if a number is prime."""
        if n <= 1:
            return False
        if n == 2:
            return True
        if n % 2 == 0:
            return False
        for i in range(3, int(n**0.5) + 1, 2):
            if n % i == 0:
                return False
        return True

    start1, end1 = interval1
    start2, end2 = interval2

    # Calculate the intersection interval
    intersection_start = max(start1, start2)
    intersection_end = min(end1, end2)

    # Check if the intervals intersect
    if intersection_start > intersection_end:
        return "NO"

    # Calculate the length of the intersection
    intersection_length = intersection_end - intersection_start + 1

    # Check if the intersection length is a prime number
    if is_prime(intersection_length):
        return "YES"
    else:
        return "NO"

def check(candidate):

    # Check some simple cases
    assert candidate((1, 2), (2, 3)) == "NO"
    assert candidate((-1, 1), (0, 4)) == "NO"
    assert candidate((-3, -1), (-5, 5)) == "YES"
    assert candidate((-2, 2), (-4, 0)) == "YES"

    # Check some edge cases that are easy to work out by hand.
    assert candidate((-11, 2), (-1, -1)) == "NO"
    assert candidate((1, 2), (3, 5)) == "NO"
    assert candidate((1, 2), (1, 2)) == "NO"
    assert candidate((-2, -2), (-3, -2)) == "NO"


check(intersection)
