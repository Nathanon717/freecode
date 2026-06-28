from stats import compute_stats

SCORES = [72, 85, 91, 68, 79, 88, 95, 74]

if __name__ == "__main__":
    result = compute_stats(SCORES)
    print(f"count={result['count']}")
    print(f"total={result['total']}")
    print(f"average={result['average']:.2f}")
    print(f"median={result['median']:.2f}")
