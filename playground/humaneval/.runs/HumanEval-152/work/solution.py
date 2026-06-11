def compare(game, guess):
    """Compare the actual game results with the guessed results.

    Args:
        game (list): List of actual game results.
        guess (list): List of guessed results.

    Returns:
        list: A list of absolute differences between the actual results and the guesses.
    """
    return [abs(g - s) for s, g in zip(game, guess)]