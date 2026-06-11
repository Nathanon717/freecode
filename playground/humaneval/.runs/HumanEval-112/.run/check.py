def reverse_delete(s, c):
    # Delete all characters in s that are in c
    result_str = ''.join([char for char in s if char not in c])
    
    # Check if the result string is a palindrome
    is_palindrome = result_str == result_str[::-1]
    
    return (result_str, is_palindrome)
def check(candidate):

    assert candidate("abcde","ae") == ('bcd',False)
    assert candidate("abcdef", "b") == ('acdef',False)
    assert candidate("abcdedcba","ab") == ('cdedc',True)
    assert candidate("dwik","w") == ('dik',False)
    assert candidate("a","a") == ('',True)
    assert candidate("abcdedcba","") == ('abcdedcba',True)
    assert candidate("abcdedcba","v") == ('abcdedcba',True)
    assert candidate("vabba","v") == ('abba',True)
    assert candidate("mamma", "mia") == ("", True)

check(reverse_delete)
