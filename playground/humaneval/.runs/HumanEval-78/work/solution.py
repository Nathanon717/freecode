def hex_key(num):
    """Count the number of prime digits in a hexadecimal number.

    Args:
        num (str): A hexadecimal number as a string.

    Returns:
        int: The count of prime digits in the hexadecimal number.
    """
    prime_digits = {'2', '3', '5', '7', 'B', 'D'}
    count = 0
    for digit in num:
        if digit in prime_digits:
            count += 1
    return count