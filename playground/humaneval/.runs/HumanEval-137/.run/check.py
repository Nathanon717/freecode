def compare_one(a, b):
    """
    Create a function that takes integers, floats, or strings representing
    real numbers, and returns the larger variable in its given variable type.
    Return None if the values are equal.
    Note: If a real number is represented as a string, the floating point might be . or ,

    compare_one(1, 2.5) ➞ 2.5
    compare_one(1, "2,3") ➞ "2,3"
    compare_one("5,1", "6") ➞ "6"
    compare_one("1", 1) ➞ None
    """
    def parse_value(value):
        if isinstance(value, (int, float)):
            return float(value)
        elif isinstance(value, str):
            normalized_value = value.replace(',', '.')
            try:
                return float(normalized_value)
            except ValueError:
                return float('inf') if value else float('-inf')
        else:
            raise ValueError("Unsupported type")
    
    try:
        parsed_a = parse_value(a)
        parsed_b = parse_value(b)
    except ValueError:
        return None

    if parsed_a > parsed_b:
        return a
    elif parsed_b > parsed_a:
        return b
    else:
        return None
def check(candidate):

    # Check some simple cases
    assert candidate(1, 2) == 2
    assert candidate(1, 2.5) == 2.5
    assert candidate(2, 3) == 3
    assert candidate(5, 6) == 6
    assert candidate(1, "2,3") == "2,3"
    assert candidate("5,1", "6") == "6"
    assert candidate("1", "2") == "2"
    assert candidate("1", 1) == None

    # Check some edge cases that are easy to work out by hand.
    assert True


check(compare_one)
