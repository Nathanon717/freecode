def strange_sort_list(lst):
    """
    Given list of integers, return list in strange order.
    Strange sorting, is when you start with the minimum value,
    then maximum of the remaining integers, then minimum and so on.

    Examples:
    strange_sort_list([1, 2, 3, 4]) == [1, 4, 2, 3]
    strange_sort_list([5, 5, 5, 5]) == [5, 5, 5, 5]
    strange_sort_list([]) == []
    """
    result = []
    is_min_turn = True
    while lst:
        if is_min_turn:
            next_val = min(lst)
        else:
            next_val = max(lst)
        result.append(next_val)
        lst.remove(next_val)
        is_min_turn = not is_min_turn
    return result