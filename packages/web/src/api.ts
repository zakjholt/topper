export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isForm = init.body instanceof FormData;
  if (!isForm && !headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || res.statusText);
  }
  return data;
}

export async function uploadFile(file: File): Promise<string> {
  const body = new FormData();
  body.set("file", file);
  const result = await api<{ url: string }>("/api/upload", { method: "POST", body });
  return result.url;
}
