def move_one_ball(arr):
    if not arr:
        return True

    sorted_arr = sorted(arr)
    n = len(arr)

    for i in range(n):
        if arr[i] == sorted_arr[0]:
            if arr[i:] + arr[:i] == sorted_arr:
                return True

    return False