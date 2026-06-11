def encrypt(s: str) -> str:
    """Encrypts a string by rotating each character in the alphabet by 4 places.

    Args:
        s: The input string to be encrypted.

    Returns:
        The encrypted string.
    """
    result = []
    for char in s:
        if char.isalpha():
            # Determine the base ASCII value for 'a' or 'A'
            base = ord('a') if char.islower() else ord('A')
            # Calculate the new character position with rotation by 4
            new_char = chr((ord(char) - base + 4) % 26 + base)
            result.append(new_char)
        else:
            # Leave non-alphabetic characters unchanged
            result.append(char)
    return ''.join(result)
def check(candidate):

    # Check some simple cases
    assert candidate('hi') == 'lm', "This prints if this assert fails 1 (good for debugging!)"
    assert candidate('asdfghjkl') == 'ewhjklnop', "This prints if this assert fails 1 (good for debugging!)"
    assert candidate('gf') == 'kj', "This prints if this assert fails 1 (good for debugging!)"
    assert candidate('et') == 'ix', "This prints if this assert fails 1 (good for debugging!)"

    assert candidate('faewfawefaewg')=='jeiajeaijeiak', "This prints if this assert fails 1 (good for debugging!)"
    assert candidate('hellomyfriend')=='lippsqcjvmirh', "This prints if this assert fails 2 (good for debugging!)"
    assert candidate('dxzdlmnilfuhmilufhlihufnmlimnufhlimnufhfucufh')=='hbdhpqrmpjylqmpyjlpmlyjrqpmqryjlpmqryjljygyjl', "This prints if this assert fails 3 (good for debugging!)"

    # Check some edge cases that are easy to work out by hand.
    assert candidate('a')=='e', "This prints if this assert fails 2 (also good for debugging!)"


check(encrypt)
