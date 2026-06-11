def tri(n):
    """
    Generate the first n+1 numbers of the Tribonacci sequence.

    The Tribonacci sequence is defined by the recurrence:
    tri(1) = 3
    tri(n) = 1 + n / 2, if n is even.
    tri(n) = tri(n - 1) + tri(n - 2) + tri(n + 1), if n is odd.

    Args:
    n (int): A non-negative integer.

    Returns:
    list: The first n+1 numbers of the Tribonacci sequence.
    """
    if n < 0:
        return []

    # Initialize the sequence with the first element.
    sequence = [1]

    if n == 0:
        return sequence

    # Generate the sequence up to the nth element.
    for i in range(1, n + 1):
        if i == 1:
            current = 3
        elif i % 2 == 0:
            current = 1 + i / 2
        else:
            # For odd i, compute the sum of the previous two and the next even element.
            if i + 1 <= n:
                next_even = 1 + (i + 1) / 2
            else:
                next_even = 0  # Placeholder, as it won't be used in the sum if i + 1 > n
            current = sequence[i - 1] + sequence[i - 2] + next_even
        sequence.append(int(current))

    return sequence
def check(candidate):

    # Check some simple cases
    
    assert candidate(3) == [1, 3, 2.0, 8.0]
    assert candidate(4) == [1, 3, 2.0, 8.0, 3.0]
    assert candidate(5) == [1, 3, 2.0, 8.0, 3.0, 15.0]
    assert candidate(6) == [1, 3, 2.0, 8.0, 3.0, 15.0, 4.0]
    assert candidate(7) == [1, 3, 2.0, 8.0, 3.0, 15.0, 4.0, 24.0]
    assert candidate(8) == [1, 3, 2.0, 8.0, 3.0, 15.0, 4.0, 24.0, 5.0]
    assert candidate(9) == [1, 3, 2.0, 8.0, 3.0, 15.0, 4.0, 24.0, 5.0, 35.0]
    assert candidate(20) == [1, 3, 2.0, 8.0, 3.0, 15.0, 4.0, 24.0, 5.0, 35.0, 6.0, 48.0, 7.0, 63.0, 8.0, 80.0, 9.0, 99.0, 10.0, 120.0, 11.0]

    # Check some edge cases that are easy to work out by hand.
    assert candidate(0) == [1]
    assert candidate(1) == [1, 3]

check(tri)
