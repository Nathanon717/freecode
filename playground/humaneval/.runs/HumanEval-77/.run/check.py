def iscube(a):
    '''
    Check if an integer is a cube of some integer number.

    Args:
    a (int): The integer to check.

    Returns:
    bool: True if 'a' is a cube of some integer, False otherwise.
    '''
    if a == 0:
        return True
    # Handle negative numbers
    abs_a = abs(a)
    # Calculate the cube root of the absolute value and round it to the nearest integer
    cube_root = round(abs_a ** (1/3))
    # Check if cubing the cube root gives back the original number
    return cube_root ** 3 == abs_a
def check(candidate):

    # Check some simple cases
    assert candidate(1) == True, "First test error: " + str(candidate(1))
    assert candidate(2) == False, "Second test error: " + str(candidate(2))
    assert candidate(-1) == True, "Third test error: " + str(candidate(-1))
    assert candidate(64) == True, "Fourth test error: " + str(candidate(64))
    assert candidate(180) == False, "Fifth test error: " + str(candidate(180))
    assert candidate(1000) == True, "Sixth test error: " + str(candidate(1000))


    # Check some edge cases that are easy to work out by hand.
    assert candidate(0) == True, "1st edge test error: " + str(candidate(0))
    assert candidate(1729) == False, "2nd edge test error: " + str(candidate(1728))


check(iscube)
