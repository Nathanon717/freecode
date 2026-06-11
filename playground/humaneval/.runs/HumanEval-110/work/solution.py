def exchange(lst1, lst2):
    """Check if it's possible to exchange elements between lst1 and lst2 to make all elements of lst1 even."""
    # Count the number of odd numbers in lst1
    odd_in_lst1 = sum(1 for num in lst1 if num % 2 != 0)
    
    # Count the number of even numbers in lst2
    even_in_lst2 = sum(1 for num in lst2 if num % 2 == 0)
    
    # Check if there are enough even numbers in lst2 to replace all odd numbers in lst1
    if even_in_lst2 >= odd_in_lst1:
        return "YES"
    else:
        return "NO"
