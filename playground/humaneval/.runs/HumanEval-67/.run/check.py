import re

def fruit_distribution(s: str, n: int) -> int:
    """
    Given a string that represents a number of apples and oranges
    and an integer representing the total number of fruits in the basket,
    return the number of mango fruits in the basket.
    
    Examples:
    fruit_distribution("5 apples and 6 oranges", 19) -> 8
    fruit_distribution("0 apples and 1 oranges", 3) -> 2
    fruit_distribution("2 apples and 3 oranges", 100) -> 95
    fruit_distribution("100 apples and 1 oranges", 120) -> 19
    """
    # Extract all numbers from the string
    numbers = re.findall(r'\d+', s)
    # The first number is apples, the second is oranges
    apples = int(numbers[0])
    oranges = int(numbers[1])
    return n - apples - oranges

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
