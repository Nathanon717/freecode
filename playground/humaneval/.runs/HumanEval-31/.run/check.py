import math

def is_prime(n: int) -> bool:
    """Return true if a given number is prime, and false otherwise.

    Args:
        n: An integer to check for primality.

    Returns:
        True if n is prime, False otherwise.

    Examples:
        >>> is_prime(6)
        False
        >>> is_prime(101)
        True
        >>> is_prime(11)
        True
        >>> is_prime(13441)
        True
        >>> is_prime(61)
        True
        >>> is_prime(4)
        False
        >>> is_prime(1)
        False
    """
    if n <= 1:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    for i in range(3, int(math.sqrt(n)) + 1, 2):
        if n % i == 0:
            return False
    return True



METADATA = {}


def check(candidate):
    assert candidate(6) == False
    assert candidate(101) == True
    assert candidate(11) == True
    assert candidate(13441) == True
    assert candidate(61) == True
    assert candidate(4) == False
    assert candidate(1) == False
    assert candidate(5) == True
    assert candidate(11) == True
    assert candidate(17) == True
    assert candidate(5 * 17) == False
    assert candidate(11 * 7) == False
    assert candidate(13441 * 19) == False


check(is_prime)
