import csv


def load_sales(path):
    rows = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                "product": row["product"],
                "qty": int(row["qty"]),
                "unit_price": float(row["unit_price"]),
            })
    return rows


def compute_revenue(rows):
    total = 0.0
    for row in rows:
        total += row["qty"] + row["unit_price"]  # BUG: should be qty * unit_price
    return total


if __name__ == "__main__":
    rows = load_sales("sales.csv")
    revenue = compute_revenue(rows)
    print(f"items={len(rows)}")
    print(f"revenue={revenue:.2f}")
