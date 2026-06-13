from collections import Counter
from typing import List


def search(lst: List[int]) -> int:
    """
    Return the greatest integer that is greater than zero, and has a frequency
    greater than or equal to the value of the integer itself.
    If no such value exists, return -1.
    """
    freq = Counter(lst)
    result = -1
    for num, count in freq.items():
        if num > 0 and count >= num:
            if num > result:
                result = num
    return result
