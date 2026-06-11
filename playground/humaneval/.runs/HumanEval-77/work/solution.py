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