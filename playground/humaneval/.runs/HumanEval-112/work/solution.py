def reverse_delete(s, c):
    # Delete all characters in s that are in c
    result_str = ''.join([char for char in s if char not in c])
    
    # Check if the result string is a palindrome
    is_palindrome = result_str == result_str[::-1]
    
    return (result_str, is_palindrome)