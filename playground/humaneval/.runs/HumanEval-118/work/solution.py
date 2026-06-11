def get_closest_vowel(word):
    vowels = {'a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U'}
    n = len(word)
    
    for i in range(n - 2, 0, -1):
        current_char = word[i]
        if current_char in vowels:
            if (word[i-1] not in vowels) and (word[i+1] not in vowels):
                return current_char
    return ""
