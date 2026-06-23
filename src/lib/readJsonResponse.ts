export async function readJsonResponse<T = any>(response: Response, fallbackLabel = 'request'): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`${fallbackLabel} returned empty response`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${fallbackLabel} returned non-JSON response`);
  }
}
