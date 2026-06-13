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
    # x = 0 is a root when the constant term is zero
    if xs[0] == 0:
        return 0.0

    # --- Find a bracketing interval [left, right] where f(left) and f(right)
    #     have opposite signs (or one of them is zero).  For an odd-degree
    #     polynomial this is always possible.
    step = 1.0
    left = -step
    right = step

    for _ in range(100):
        fl = poly(xs, left)
        fr = poly(xs, right)
        if fl * fr <= 0:          # sign change (or root at endpoint)
            break
        step *= 2.0               # expand the search window
        left = -step
        right = step

    # Endpoint is already a root
    if fl == 0:
        return left
    if fr == 0:
        return right

    # Make sure fl is negative and fr is positive
    if fl > 0:
        left, right = right, left
        fl, fr = fr, fl

    # --- Bisection
    for _ in range(200):
        mid = (left + right) / 2.0
        fmid = poly(xs, mid)
        if abs(fmid) < 1e-14 or abs(right - left) < 1e-14:
            return mid
        if fmid < 0:
            left = mid
            fl = fmid
        else:
            right = mid
            fr = fmid

    # Fallback (should be very close already)
    return (left + right) / 2.0



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
