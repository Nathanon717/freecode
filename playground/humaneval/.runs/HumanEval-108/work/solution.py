def count_nums(arr):
    """
    Write a function count_nums which takes an array of integers and returns
    the number of elements which has a sum of digits > 0.
    If a number is negative, then its first signed digit will be negative:
    e.g. -123 has signed digits -1, 2, and 3.
    >>> count_nums([]) == 0
    >>> count_nums([-1, 11, -11]) == 1
    >>> count_nums([1, 1, 2]) == 3
    """
    count = 0
    for num in arr:
        digit_sum = 0
        is_negative = num < 0
        num_str = str(abs(num))
        
        for i, digit in enumerate(num_str):
            digit_int = int(digit)
            if i == 0 and is_negative:
                digit_int = -digit_int
            digit_sum += digit_int
        
        if digit_sum > 0:
            count += 1
    return count
