numbers = [3, 5, 8]


def summarize(values):
    total = sum(values)
    return {
        "count": len(values),
        "total": total,
        "average": total / len(values),
    }


if __name__ == "__main__":
    stats = summarize(numbers)
    print(f"count={stats['count']}")
    print(f"total={stats['total']}")
    print(f"average={stats['average']:.2f}'")
