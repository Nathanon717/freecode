def circular_shift(x: int, shift: int) -> str:
    """Circular shift the digits of the integer x, shift the digits right by shift and return the result as a string.
    If shift > number of digits, return digits reversed.

    Args:
        x: The integer to shift.
        shift: The number of digits to shift.

    Returns:
        The shifted number as a string.
    """
    digits = list(str(x))
    if shift > len(digits):
        return str(x)[::-1]
    shifted_digits = digits[-shift:] + digits[:-shift]
    return ''.join(shifted_digits)