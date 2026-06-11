import re

def file_name_check(file_name):
    """Check if a file name is valid based on specific conditions.

    Args:
        file_name (str): The name of the file to check.

    Returns:
        str: 'Yes' if the file name is valid, otherwise 'No'.
    """
    # Check for more than three digits in the file name
    if len(re.findall(r'\d', file_name)) > 3:
        return 'No'
    
    # Check for exactly one dot in the file name
    if file_name.count('.') != 1:
        return 'No'
    
    # Split the file name into name and extension
    name_part, extension_part = file_name.split('.')
    
    # Check if the name part is not empty and starts with a latin alphabet letter
    if not name_part or not re.match(r'^[a-zA-Z]', name_part):
        return 'No'
    
    # Check if the extension is one of the allowed values
    if extension_part not in ['txt', 'exe', 'dll']:
        return 'No'
    
    return 'Yes'