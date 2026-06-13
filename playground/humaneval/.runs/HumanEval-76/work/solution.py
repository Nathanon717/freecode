def is_simple_power(x, n):
    """Return True if x is a simple power of n, i.e., there exists an integer
    exponent e such that n**e == x, and False otherwise.

    Examples:
    is_simple_power(1, 4) => True   (4**0 == 1)
    is_simple_power(2, 2) => True   (2**1 == 2)
    is_simple_power(8, 2) => True   (2**3 == 8)
    is_simple_power(3, 2) => False
    is_simple_power(3, 1) => False
    is_simple_power(5, 3) => False
    """
    # Handle the special case n == 1
    if n == 1:
        return x == 1

    # Edge case: n == 0
    if n == 0:
        # 0**0 == 1, 0**e == 0 for e > 0
        return x == 0 or x == 1

    # Handle n == -1 to avoid an infinite loop (oscillates between 1 and -1)
    if n == -1:
        return x == -1 or x == 1

    # For all other n (including negative n), use repeated multiplication.
    result = 1
    # If x is 1, it matches n**0
    if x == 1:
        return True

    # For n > 0: keep multiplying until result >= x
    # For n < 0: the sequence alternates sign, so we need to check signs
    if n > 0:
        while result < x:
            result *= n
            if result == x:
                return True
        return False
    else:
        # n < 0
        while True:
            result *= n
            if result == x:
                return True
            # Stop if result overshoots in absolute value (both signs)
            if abs(result) > abs(x):
                return False
