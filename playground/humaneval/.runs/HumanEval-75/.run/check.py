def is_multiply_prime(a):
    """Check if a number is the product of exactly three prime numbers."""
    if a < 2:
        return False

    def is_prime(n):
        """Helper function to check if a number is prime."""
        if n < 2:
            return False
        for i in range(2, int(n**0.5) + 1):
            if n % i == 0:
                return False
        return True

    prime_factors = []
    temp = a

    # Factorize the number
    for i in range(2, temp + 1):
        while temp % i == 0 and is_prime(i):
            prime_factors.append(i)
            temp = temp // i

    # Check if the product of exactly three primes
    if len(prime_factors) == 3 and a == (prime_factors[0] * prime_factors[1] * prime_factors[2]):
        return True
    else:
        return False

def check(candidate):

    assert candidate(5) == False
    assert candidate(30) == True
    assert candidate(8) == True
    assert candidate(10) == False
    assert candidate(125) == True
    assert candidate(3 * 5 * 7) == True
    assert candidate(3 * 6 * 7) == False
    assert candidate(9 * 9 * 9) == False
    assert candidate(11 * 9 * 9) == False
    assert candidate(11 * 13 * 7) == True


check(is_multiply_prime)
