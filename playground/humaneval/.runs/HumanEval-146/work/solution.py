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