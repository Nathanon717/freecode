import os
from openai import OpenAI

API_KEY = os.environ["GITHUB_TOKEN"]
BASE_URL = "https://models.inference.ai.azure.com"
MODEL = "gpt-4o-mini"

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

response = client.chat.completions.create(
    model=MODEL,
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
    max_tokens=50,
)

print(response.choices[0].message.content)
