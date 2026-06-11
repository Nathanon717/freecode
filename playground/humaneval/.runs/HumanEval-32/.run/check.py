import math

def poly(xs: list, x: float):
    """
    Evaluates polynomial with coefficients xs at point x.
    return xs[0] + xs[1] * x + xs[1] * x^2 + .... xs[n] * x^n
    """
    return sum([coeff * math.pow(x, i) for i, coeff in enumerate(xs)])

def find_zero(xs: list):
    """ xs are coefficients of a polynomial.
    find_zero find x such that poly(x) = 0.
    find_zero returns only only zero point, even if there are many.
    Moreover, find_zero only takes list xs having even number of coefficients
    and largest non zero coefficient as it guarantees
    a solution.
    >>> round(find_zero([1, 2]), 2) # f(x) = 1 + 2x
    -0.5
    >>> round(find_zero([-6, 11, -6, 1]), 2) # (x - 1) * (x - 2) * (x - 3) = -6 + 11x - 6x^2 + x^3
    1.0
    """
    if len(xs) % 2 != 0:
        raise ValueError("The list of coefficients must have an even number of elements.")

    # Start with a guess based on the ratio of the first two coefficients
    x_guess = -xs[0] / xs[1]

    # Use Newton's method to refine the guess
    for _ in range(100):  # Limit iterations to prevent infinite loops
        fx = poly(xs, x_guess)
        if abs(fx) < 1e-10:  # Check if the current guess is close enough to zero
            return x_guess
        # Compute the derivative using a small delta
        delta = 1e-6
        fx_delta = poly(xs, x_guess + delta)
        derivative = (fx_delta - fx) / delta
        if derivative == 0:
            break  # Avoid division by zero
        x_guess = x_guess - fx / derivative

    return x_guess


METADATA = {}


def check(candidate):
    import math
    import random
    rng = random.Random(42)
    import copy
    for _ in range(100):
        ncoeff = 2 * rng.randint(1, 4)
        coeffs = []
        for _ in range(ncoeff):
            coeff = rng.randint(-10, 10)
            if coeff == 0:
                coeff = 1
            coeffs.append(coeff)
        solution = candidate(copy.deepcopy(coeffs))
        assert math.fabs(poly(coeffs, solution)) < 1e-4


check(find_zero)
