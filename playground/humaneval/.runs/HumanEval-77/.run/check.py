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
