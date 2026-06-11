import re

def fix_spaces(text):
    # Replace more than 2 consecutive spaces with -
    text = re.sub(r' {2,}', '-', text)
    # Replace single spaces with underscores
    text = re.sub(r' -| -| ', '_', text)
    return text