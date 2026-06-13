def iscube(a):
    '''
    Write a function that takes an integer a and returns True 
    if this ingeger is a cube of some integer number.
    Note: you may assume the input is always valid.
    Examples:
    iscube(1) ==> True
    iscube(2) ==> False
    iscube(-1) ==> True
    iscube(64) ==> True
    iscube(0) ==> True
    iscube(180) ==> False
    '''
    # Handle 0 explicitly
    if a == 0:
        return True

    # Work with absolute value for the cube root search
    n = abs(a)

    # Binary search for an integer x such that x**3 == n
    low = 0
    high = n

    while low <= high:
        mid = (low + high) // 2
        cube = mid * mid * mid
        if cube == n:
            # Found an integer cube root; the sign of a is handled by abs.
            # If a > 0, mid >= 0; if a < 0, the cube root is -mid, which is an integer.
            return True
        elif cube < n:
            low = mid + 1
        else:
            high = mid - 1

    return False
