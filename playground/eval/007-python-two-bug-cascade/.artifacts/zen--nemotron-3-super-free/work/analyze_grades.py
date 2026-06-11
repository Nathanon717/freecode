import csv
import statistics


def load_grades(path):
    grades = {}
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            subject = row["subject"]
            score = float(row["score"])
            grades.setdefault(subject, []).append(score)
    return grades


def summarize(grades):
    lines = []
    for subject in sorted(grades):
        scores = grades[subject]
        avg = statistics.mean(scores)
        std = statistics.stdev(scores)
        lines.append(f"{subject}: avg={avg:.1f} std={std:.2f}")
    return lines


if __name__ == "__main__":
    grades = load_grades("grades.csv")
    for line in summarize(grades):
        print(line)
