def is_nested(s: str) -> bool:
    stack = 0
    has_nested = False
    
    for char in s:
        if char == '[':
            if stack > 0:
                has_nested = True
            stack += 1
        else:
            stack -= 1
    
    return has_nested and stack == 0