from collections import defaultdict

def histogram(test):
    """Given a string representing a space separated lowercase letters, return a dictionary
    of the letter with the most repetition and containing the corresponding count.
    If several letters have the same occurrence, return all of them.

    Example:
    histogram('a b c') == {'a': 1, 'b': 1, 'c': 1}
    histogram('a b b a') == {'a': 2, 'b': 2}
    histogram('a b c a b') == {'a': 2, 'b': 2}
    histogram('b b b b a') == {'b': 4}
    histogram('') == {}
    """
    if not test:
        return {}
    
    words = test.split()
    
    # Count occurrences of each word
    word_counts = defaultdict(int)
    for word in words:
        word_counts[word] += 1
    
    if not word_counts:
        return {}
    
    # Find the maximum count
    max_count = max(word_counts.values())
    
    # Collect all words with the maximum count
    result = {word: count for word, count in word_counts.items() if count == max_count}
    
    return result