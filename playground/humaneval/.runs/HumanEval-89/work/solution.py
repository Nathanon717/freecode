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