def get_max_triples(n):
    # Generate the array a
    a = [i * i - i + 1 for i in range(1, n + 1)]

    # Initialize counters for numbers with remainders 0, 1, 2 when divided by 3
    count_0 = count_1 = count_2 = 0

    # Count the numbers based on their remainders when divided by 3
    for num in a:
        remainder = num % 3
        if remainder == 0:
            count_0 += 1
        elif remainder == 1:
            count_1 += 1
        else:
            count_2 += 1

    # Calculate the number of valid triples
    # Triples can be formed in the following ways:
    # 1. All three numbers have remainder 0: count_0 choose 3
    # 2. All three numbers have remainder 1: count_1 choose 3
    # 3. All three numbers have remainder 2: count_2 choose 3
    # 4. One number from each remainder group: count_0 * count_1 * count_2
    # 5. Two numbers with remainder 0 and one with remainder 1: count_0 choose 2 * count_1
    # 6. Two numbers with remainder 0 and one with remainder 2: count_0 choose 2 * count_2
    # 7. One number with remainder 0 and two with remainder 1: count_0 * (count_1 choose 2)
    # 8. One number with remainder 0 and two with remainder 2: count_0 * (count_2 choose 2)
    # 9. Two numbers with remainder 1 and one with remainder 2: count_1 choose 2 * count_2
    # 10. One number with remainder 1 and two with remainder 2: count_1 * (count_2 choose 2)

    def choose_2(x):
        return x * (x - 1) // 2

    def choose_3(x):
        return x * (x - 1) * (x - 2) // 6
    triples = 0
    triples += choose_3(count_0)
    triples += choose_3(count_1)
    triples += choose_3(count_2)
    triples += count_0 * count_1 * count_2
    triples += choose_2(count_0) * count_1
    triples += choose_2(count_0) * count_2
    triples += count_0 * choose_2(count_1)
    triples += count_0 * choose_2(count_2)
    triples += choose_2(count_1) * count_2
    triples += count_1 * choose_2(count_2)

    return triples
def check(candidate):

    assert candidate(5) == 1
    assert candidate(6) == 4
    assert candidate(10) == 36
    assert candidate(100) == 53361

check(get_max_triples)
