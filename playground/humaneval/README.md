# HumanEval Dataset

The dataset files (`data/`) are gitignored due to size. Download them from the official source:

```
mkdir -p playground/humaneval/data
curl -L https://github.com/openai/human-eval/raw/master/data/HumanEval.jsonl.gz \
  -o playground/humaneval/data/HumanEval.jsonl.gz
gunzip playground/humaneval/data/HumanEval.jsonl.gz
```

Or download `HumanEval.jsonl.gz` directly from https://github.com/openai/human-eval/tree/master/data and place it in `playground/humaneval/data/`.
