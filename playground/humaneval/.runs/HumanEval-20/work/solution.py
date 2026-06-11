from typing import List, Tuple

def find_closest_elements(numbers: List[float]) -> Tuple[float, float]:
    """ From a supplied list of numbers (of length at least two) select and return two that are the closest to each
    other and return them in order (smaller number, larger number).
    >>> find_closest_elements([1.0, 2.0, 3.0, 4.0, 5.0, 2.2])
    (2.0, 2.2)
    >>> find_closest_elements([1.0, 2.0, 3.0, 4.0, 5.0, 2.0])
    (2.0, 2.0)
    """
    numbers_sorted = sorted(numbers)
    min_distance = float('inf')
    result = (None, None)

    for i in range(len(numbers_sorted) - 1):
        current_distance = numbers_sorted[i + 1] - numbers_sorted[i]
        if current_distance < min_distance:
            min_distance = current_distance
            result = (numbers_sorted[i], numbers_sorted[i + 1])

    return result
