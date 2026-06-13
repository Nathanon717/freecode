def starts_one_ends(n):
    """
    Given a positive integer n, return the count of the numbers of n-digit
    positive integers that start or end with 1.
    """
    if n == 1:
        return 1
    # Numbers starting with 1: 1 * 10^(n-1)
    # Numbers ending with 1: first digit 1-9 (9 choices), last digit 1, middle n-2 digits 0-9 => 9 * 10^(n-2)
    # Numbers both starting and ending with 1: 1 * 10^(n-2)
    return 10 ** (n - 1) + 9 * 10 ** (n - 2) - 10 ** (n - 2)
