import math

def is_simple_power(x, n):
    """Check if x is a simple power of n.

    A number x is a simple power of n if there exists an integer k such that n**k == x.

    Args:
        x (int): The number to check.
        n (int): The base number.

    Returns:
        bool: True if x is a simple power of n, False otherwise.
    """
    if n == 1:
        return False  # 1 to any power is 1, but simple power requires n > 1

    # Handle the case where x is 1
    if x == 1:
        return True

    # Calculate the logarithm of x with base n
    try:
        k = math.log(x, n)
    except ValueError:
        return False

    # Check if k is an integer
    return k.is_integer()