// One image-generation call through OpenRouter. Returns the decoded bytes plus
// the reported cost; throws on HTTP errors or an image-less response.
export async function requestImage({ key, model, prompt }) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ordermyphones.com',
      'X-Title': 'OrderMyPhones',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image', 'text'],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  const images = json.choices?.[0]?.message?.images ?? [];
  if (images.length === 0) throw new Error('no image in response');
  const url = images[0].image_url?.url ?? images[0].url ?? '';
  const b64 = url.includes(',') ? url.split(',')[1] : url;
  return { buf: Buffer.from(b64, 'base64'), cost: json.usage?.cost ?? 0 };
}
