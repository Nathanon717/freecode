from math import gcd

def simplify(x: str, n: str) -> bool:
    def parse_fraction(fraction: str):
        numerator, denominator = map(int, fraction.split('/'))
        return numerator, denominator
    
    x_num, x_den = parse_fraction(x)
    n_num, n_den = parse_fraction(n)
    
    # Multiply the fractions
    result_num = x_num * n_num
    result_den = x_den * n_den
    
    # Simplify the result
    common_divisor = gcd(result_num, result_den)
    simplified_num = result_num // common_divisor
    simplified_den = result_den // common_divisor
    
    # Check if the simplified denominator is 1 (i.e., a whole number)
    return simplified_den == 1