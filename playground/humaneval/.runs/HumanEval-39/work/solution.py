def is_prime(num: int) -> bool:
    """Return True if num is a prime number, False otherwise."""
    if num < 2:
        return False
    if num % 2 == 0:
        return num == 2
    i = 3
    while i * i <= num:
        if num % i == 0:
            return False
        i += 2
    return True


def prime_fib(n: int) -> int:
    """
    prime_fib returns n-th number that is a Fibonacci number and it's also prime.
    >>> prime_fib(1)
    2
    >>> prime_fib(2)
    3
    >>> prime_fib(3)
    5
    >>> prime_fib(4)
    13
    >>> prime_fib(5)
    89
    """
    if n <= 0:
        raise ValueError("n must be a positive integer")

    count = 0
    a, b = 0, 1  # Fibonacci sequence: F(0)=0, F(1)=1

    while True:
        # Check the current Fibonacci number (starting from F(1)=1, F(2)=1, ...)
        if is_prime(b):
            count += 1
            if count == n:
                return b

        # Generate next Fibonacci number
        a, b = b, a + b
