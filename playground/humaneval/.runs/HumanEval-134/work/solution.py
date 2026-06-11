import re

def check_if_last_char_is_a_letter(txt):
    '''
    Check if the last character of a given string is an alphabetical character and not part of a word.

    Args:
    txt (str): The input string to check.

    Returns:
    bool: True if the last character is a letter and not part of a word, False otherwise.
    '''
    # Check if the string is empty
    if not txt:
        return False
    
    # Check if the last character is a letter
    if not txt[-1].isalpha():
        return False

    # Check if the last character is part of a word
    # Using regex to find the last word
    last_word_match = re.search(r'\w+$', txt)
    if last_word_match:
        last_word = last_word_match.group()
        # If the last word is exactly the last character, it's not part of a longer word
        if len(last_word) == 1:
            return True
    
    return False