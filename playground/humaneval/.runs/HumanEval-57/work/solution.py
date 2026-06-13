def monotonic(l: list):
    """Return True is list elements are monotonically increasing or decreasing.
    >>> monotonic([1, 2, 4, 20])
    True
    >>> monotonic([1, 20, 4, 10])
    False
    >>> monotonic([4, 1, 0, -10])
    True
    """
    increasing = all(l[i] >= l[i - 1] for i in range(1, len(l)))
    decreasing = all(l[i] <= l[i - 1] for i in range(1, len(l)))
    return increasing or decreasing
