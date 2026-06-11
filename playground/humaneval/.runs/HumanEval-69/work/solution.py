from collections import defaultdict

def search(lst):
    '''
    You are given a non-empty list of positive integers. Return the greatest integer that is greater than 
    zero, and has a frequency greater than or equal to the value of the integer itself. 
    The frequency of an integer is the number of times it appears in the list.
    If no such a value exist, return -1.
    Examples:
        search([4, 1, 2, 2, 3, 1]) == 2
        search([1, 2, 2, 3, 3, 3, 4, 4, 4]) == 3
        search([5, 5, 4, 4, 4]) == -1
    '''
    frequency_map = defaultdict(int)
    for num in lst:
        frequency_map[num] += 1
    
    result = -1
    for num in frequency_map:
        if num > 0 and frequency_map[num] >= num:
            if num > result:
                result = num
    
    return result