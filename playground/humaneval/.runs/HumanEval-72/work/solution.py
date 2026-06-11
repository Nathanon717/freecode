def will_it_fly(q, w):
    """
    Check if the object q will fly based on balance and weight.

    Args:
    q (list): The object to check.
    w (int): The maximum possible weight.

    Returns:
    bool: True if the object will fly, False otherwise.
    """
    # Check if the object is balanced (palindromic list)
    is_balanced = q == q[::-1]
    
    # Check if the sum of elements is less than or equal to the maximum weight
    sum_elements = sum(q)
    
    # Return True if both conditions are met, False otherwise
    return is_balanced and sum_elements <= w