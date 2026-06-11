import re

def fruit_distribution(s: str, n: int) -> int:
    """
    Calculate the number of mango fruits in the basket.

    Args:
        s: A string representing the number of apples and oranges.
        n: An integer representing the total number of fruits in the basket.

    Returns:
        The number of mango fruits in the basket.
    """
    # Use regular expression to find all numbers in the string
    numbers = list(map(int, re.findall(r\d+, s)))
    
    # Sum the numbers of apples and oranges
    total_apples_oranges = sum(numbers)
    
    # Calculate the number of mango fruits
    mango_fruits = n - total_apples_oranges
    
    return mango_fruits
