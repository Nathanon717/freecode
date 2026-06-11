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
def check(candidate):

    # Check some simple cases
    assert candidate(100, 2) == "001"
    assert candidate(12, 2) == "12"
    assert candidate(97, 8) == "79"
    assert candidate(12, 1) == "21", "This prints if this assert fails 1 (good for debugging!)"

    # Check some edge cases that are easy to work out by hand.
    assert candidate(11, 101) == "11", "This prints if this assert fails 2 (also good for debugging!)"


check(circular_shift)
