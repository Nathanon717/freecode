import os
from openai import OpenAI

API_KEY = os.environ["CEREBRAS_API_KEY"]
BASE_URL = "https://api.cerebras.ai/v1"
MODEL = "llama3.1-8b"

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

response = client.chat.completions.create(
    model=MODEL,
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
    max_tokens=50,
)

print(response.choices[0].message.content)
