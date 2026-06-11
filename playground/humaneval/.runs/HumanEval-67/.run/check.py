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

def check(candidate):

    # Check some simple cases
    assert candidate("5 apples and 6 oranges",19) == 8
    assert candidate("5 apples and 6 oranges",21) == 10
    assert candidate("0 apples and 1 oranges",3) == 2
    assert candidate("1 apples and 0 oranges",3) == 2
    assert candidate("2 apples and 3 oranges",100) == 95
    assert candidate("2 apples and 3 oranges",5) == 0
    assert candidate("1 apples and 100 oranges",120) == 19

check(fruit_distribution)
