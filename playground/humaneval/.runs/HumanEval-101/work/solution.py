import re

def words_string(s):
    """
    Split a string of words separated by commas or spaces into an array of words.

    Args:
    s (str): Input string containing words separated by commas or spaces.

    Returns:
    list: An array of words.

    Examples:
    >>> words_string("Hi, my name is John")
    ['Hi', 'my', 'name', 'is', 'John']
    >>> words_string("One, two, three, four, five, six")
    ['One', 'two', 'three', 'four', 'five', 'six']
    """
    return re.split(r'[,\s]+', s.strip())