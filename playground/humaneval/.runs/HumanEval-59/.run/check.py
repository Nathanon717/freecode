def largest_prime_factor(n: int):
    """Return the largest prime factor of n. Assume n > 1 and is not a prime.
    >>> largest_prime_factor(13195)
    29
    >>> largest_prime_factor(2048)
    2
    """
    # Divide out the factor 2
    largest = 2
    while n % 2 == 0:
        n //= 2

    # Check odd factors up to sqrt(n)
    factor = 3
    while factor * factor <= n:
        while n % factor == 0:
            n //= factor
            largest = factor
        factor += 2

    # If n is still greater than 1, it's a prime factor
    if n > 1:
        largest = n

    return largest



METADATA = {}


def check(candidate):
    assert candidate(15) == 5
    assert candidate(27) == 3
    assert candidate(63) == 7
    assert candidate(330) == 11
    assert candidate(13195) == 29


check(largest_prime_factor)
