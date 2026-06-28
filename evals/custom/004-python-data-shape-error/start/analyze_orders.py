import csv


def summarize_orders(path):
    shipped_orders = 0
    shipped_units = 0
    shipped_revenue = 0.0

    with open(path, newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row["status"] != "shipped":
                continue
            quantity = int(row["quantity"])
            shipped_orders += 1
            shipped_units += quantity
            shipped_revenue += quantity * float(row["unit_price"])

    return {
        "orders": shipped_orders,
        "units": shipped_units,
        "revenue": shipped_revenue,
    }


if __name__ == "__main__":
    summary = summarize_orders("orders.csv")
    print(f"orders={summary['orders']}")
    print(f"units={summary['units']}")
    print(f"revenue={summary['revenue']:.2f}")
