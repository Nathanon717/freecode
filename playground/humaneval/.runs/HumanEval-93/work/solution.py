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