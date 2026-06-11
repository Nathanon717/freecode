def encode(message):
    """
    Encodes a message by swapping the case of all letters and replacing all vowels
    with the letter that appears 2 places ahead in the English alphabet.

    Args:
        message (str): The input message to be encoded.

    Returns:
        str: The encoded message.

    Examples:
        >>> encode('test')
        'TGST'
        >>> encode('This is a message')
        'tHKS KS C MGSSCGG'
    """
    vowels = {'a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U'}
    vowel_map = {
        'a': 'c',
        'e': 'g',
        'i': 'k',
        'o': 'q',
        'u': 'w',
        'A': 'C',
        'E': 'G',
        'I': 'K',
        'O': 'Q',
        'U': 'W'
    }

    encoded_message = []
    for char in message:
        if char in vowels:
            encoded_message.append(vowel_map[char])
        else:
            if char.islower():
                encoded_message.append(char.upper())
            else:
                encoded_message.append(char.lower())
    return ''.join(encoded_message)
def check(candidate):

    # Check some simple cases
    assert candidate('TEST') == 'tgst', "This prints if this assert fails 1 (good for debugging!)"
    assert candidate('Mudasir') == 'mWDCSKR', "This prints if this assert fails 2 (good for debugging!)"
    assert candidate('YES') == 'ygs', "This prints if this assert fails 3 (good for debugging!)"
    
    # Check some edge cases that are easy to work out by hand.
    assert candidate('This is a message') == 'tHKS KS C MGSSCGG', "This prints if this assert fails 2 (also good for debugging!)"
    assert candidate("I DoNt KnOw WhAt tO WrItE") == 'k dQnT kNqW wHcT Tq wRkTg', "This prints if this assert fails 2 (also good for debugging!)"


check(encode)
