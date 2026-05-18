import os
from mistralai.client import Mistral

API_KEY = os.environ["MISTRAL_API_KEY"]
MODEL = "mistral-medium-latest"

client = Mistral(api_key=API_KEY)

response = client.chat.complete(
    model=MODEL,
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)

print(response.choices[0].message.content)
