def encrypt(s):
    """Create a function encrypt that takes a string as an argument and
    returns a string encrypted with the alphabet being rotated. 
    The alphabet should be rotated in a manner such that the letters 
    shift down by two multiplied to two places.
    For example:
    encrypt('hi') returns 'lm'
    encrypt('asdfghjkl') returns 'ewhjklnop'
    encrypt('gf') returns 'kj'
    encrypt('et') returns 'ix'
    """
    result = []
    for ch in s:
        if 'a' <= ch <= 'z':
            # Shift by 4 positions (2 * 2) and wrap around
            shifted = chr((ord(ch) - ord('a') + 4) % 26 + ord('a'))
            result.append(shifted)
        elif 'A' <= ch <= 'Z':
            shifted = chr((ord(ch) - ord('A') + 4) % 26 + ord('A'))
            result.append(shifted)
        else:
            result.append(ch)
    return ''.join(result)
