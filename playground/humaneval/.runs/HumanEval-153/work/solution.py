def Strongest_Extension(class_name, extensions):
    def calculate_strength(extension):
        cap = sum(1 for char in extension if char.isupper())
        sm = sum(1 for char in extension if char.islower())
        return cap - sm

    if not extensions:
        return f"{class_name}."

    strongest_ext = max(extensions, key=lambda x: calculate_strength(x))
    return f"{class_name}.{strongest_ext}"