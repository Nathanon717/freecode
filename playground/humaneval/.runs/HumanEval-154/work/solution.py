def cycpattern_check(a, b):
    """Check if the second word or any of its rotations is a substring in the first word."""
    # Generate all possible rotations of the second word
    rotations = [b[i:] + b[:i] for i in range(len(b))]
    
    # Check if any rotation of the second word is a substring in the first word
    for rotation in rotations:
        if rotation in a:
            return True
    
    return False
