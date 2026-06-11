def by_length(arr):
    # Define the mapping of digits to their corresponding names
    digit_names = {
        1: "One",
        2: "Two",
        3: "Three",
        4: "Four",
        5: "Five",
        6: "Six",
        7: "Seven",
        8: "Eight",
        9: "Nine"
    }

    # Filter the array to include only integers between 1 and 9 inclusive
    filtered_arr = [x for x in arr if isinstance(x, int) and 1 <= x <= 9]

    # Sort the filtered array
    filtered_arr.sort()

    # Reverse the sorted array
    filtered_arr.reverse()

    # Replace each digit by its corresponding name
    result = [digit_names[x] for x in filtered_arr]

    return result