def sort_even(l: list):
    """This function takes a list l and returns a list l' such that
    l' is identical to l in the odd indicies, while its values at the even indicies are equal
    to the values of the even indicies of l, but sorted.
    >>> sort_even([1, 2, 3])
    [1, 2, 3]
    >>> sort_even([5, 6, 3, 4])
    [3, 6, 5, 4]
    """
    # Separate even and odd index elements
    even_indices = l[::2]
    odd_indices = l[1::2]
    
    # Sort the even index elements
    sorted_evens = sorted(even_indices)
    
    # Reconstruct the list
    result = []
    for i in range(len(l)):
        if i % 2 == 0:
            # Even index: take from sorted_evens
            result.append(sorted_evens[i // 2])
        else:
            # Odd index: take from original odd_indices
            result.append(odd_indices[i // 2])
    
    return result


METADATA = {}


def check(candidate):
    assert tuple(candidate([1, 2, 3])) == tuple([1, 2, 3])
    assert tuple(candidate([5, 3, -5, 2, -3, 3, 9, 0, 123, 1, -10])) == tuple([-10, 3, -5, 2, -3, 3, 5, 0, 9, 1, 123])
    assert tuple(candidate([5, 8, -12, 4, 23, 2, 3, 11, 12, -10])) == tuple([-12, 8, 3, 4, 5, 2, 12, 11, 23, -10])


check(sort_even)
