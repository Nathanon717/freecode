def specialFilter(nums):
    """Filter numbers greater than 10 with odd first and last digits.

    Args:
    nums: List of integers to filter

    Returns:
    int: Count of numbers meeting the criteria
    """
    count = 0
    for num in nums:
        if num > 10:
            # Convert number to string to easily access digits
            num_str = str(abs(num))
            # Check if first and last digits are odd
            if len(num_str) > 0:
                first_digit = int(num_str[0])
                last_digit = int(num_str[-1])
                if first_digit % 2 != 0 and last_digit % 2 != 0:
                    count += 1
    return count
def check(candidate):

    # Check some simple cases
    assert candidate([5, -2, 1, -5]) == 0  
    assert candidate([15, -73, 14, -15]) == 1
    assert candidate([33, -2, -3, 45, 21, 109]) == 2
    assert candidate([43, -12, 93, 125, 121, 109]) == 4
    assert candidate([71, -2, -33, 75, 21, 19]) == 3


    # Check some edge cases that are easy to work out by hand.
    assert candidate([1]) == 0              
    assert candidate([]) == 0                   


check(specialFilter)
