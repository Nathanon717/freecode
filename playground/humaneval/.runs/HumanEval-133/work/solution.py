import math

def sum_squares(lst):
    """
    Given a list of numbers, return the sum of squared numbers in the list.
    Each element in the list is first rounded to the upper integer (ceiling).

    Examples:
    >>> sum_squares([1, 2, 3])
    14
    >>> sum_squares([1, 4, 9])
    98
    >>> sum_squares([1, 3, 5, 7])
    84
    >>> sum_squares([1.4, 4.2, 0])
    29
    >>> sum_squares([-2.4, 1, 1])
    6
    """
    return sum(math.ceil(x) ** 2 for x in lst)