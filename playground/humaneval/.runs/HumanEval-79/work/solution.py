def decimal_to_binary(decimal):
    """Convert a decimal number to a binary string with 'db' prefix and suffix.

    Args:
        decimal (int): The decimal number to convert.

    Returns:
        str: Binary string representation with 'db' prefix and suffix.
    """
    binary = bin(decimal)[2:]
    return f"db{binary}db"
