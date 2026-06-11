def compute_stats(values):
    """Compute descriptive statistics for a list of numbers.

    Returns a dict with keys: count, sum, mean, median.
    """
    n = len(values)
    s = sum(values)
    sorted_vals = sorted(values)
    mid = n // 2
    median = (sorted_vals[mid - 1] + sorted_vals[mid]) / 2 if n % 2 == 0 else float(sorted_vals[mid])
    return {
        "count": n,
        "sum": s,
        "mean": s / n,
        "median": median,
    }
