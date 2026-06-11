import re

def is_bored(S):
    """
    Count the number of boredoms in a string of words.
    A boredom is a sentence that starts with the word "I".
    Sentences are delimited by '.', '?' or '!'.

    Args:
    S (str): The input string to analyze.

    Returns:
    int: The number of boredoms in the input string.

    Examples:
    >>> is_bored("Hello world")
    0
    >>> is_bored("The sky is blue. The sun is shining. I love this weather")
    1
    """
    sentences = re.split(r'[.!?]', S)
    boredom_count = 0
    for sentence in sentences:
        sentence = sentence.strip()
        if sentence.startswith('I '):
            boredom_count += 1
    return boredom_count
