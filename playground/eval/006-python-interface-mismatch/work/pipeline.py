from stats import compute_stats

SCORES = [72, 85, 91, 68, 79, 88, 95, 74]

if __name__ == "__main__":
    result = compute_stats(SCORES)
    print(f"count={result['count']}")
    print(f"sum={result['sum']}")
    print(f"mean={result['mean']:.2f}")
    print(f"median={result['median']:.2f}")
