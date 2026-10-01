export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function api<T>(path: string, token?: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    let requestToken = token;
    if (token?.split(".").length === 3) {
      const { restoreGoogleSignIn } = await import("./firebase");
      const restored = await restoreGoogleSignIn();
      if (restored) requestToken = restored.token;
    }
    response = await fetch(API_URL + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Cannot reach the voice service. Start the Python API on port 8000 and try again.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong. Please try again.");
  return data as T;
}
