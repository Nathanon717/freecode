import math

def is_prime(n):
    """Check if a number is prime."""
    if n <= 1:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    max_divisor = math.isqrt(n) + 1
    for d in range(3, max_divisor, 2):
        if n % d == 0:
            return False
    return True

def skjkasdkd(lst):
    """Find the largest prime value in a list of integers and return the sum of its digits."""
    primes = [x for x in lst if is_prime(x)]
    if not primes:
        return 0
    largest_prime = max(primes)
    return sum(int(digit) for digit in str(largest_prime))
    """Check if a number is prime."""
    if n <= 1:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    max_divisor = math.isqrt(n) + 1
    for d in range(3, max_divisor, 2):
        if n % d == 0:
            return False
    return True