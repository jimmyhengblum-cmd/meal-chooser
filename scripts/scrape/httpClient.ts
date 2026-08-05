import https from "node:https";

// Cloudflare's bot management flags Node's built-in `fetch` (undici) purely
// on its TLS/HTTP client fingerprint, and returns 403 even with a matching
// browser User-Agent — verified against justonecookbook.com, where curl and
// Node's classic `https` module both pass with the same headers but `fetch`
// doesn't. So HTTP calls in this scraper go through `https` directly rather
// than `fetch`.

export interface HttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function requestOnce(url: string, headers: Record<string, string>): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on("error", reject);
  });
}

export async function httpGet(
  url: string,
  headers: Record<string, string>,
  maxRedirects = 5,
): Promise<HttpResponse> {
  let currentUrl = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await requestOnce(currentUrl, headers);
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      currentUrl = new URL(res.headers.location as string, currentUrl).toString();
      continue;
    }
    return res;
  }
  throw new Error(`Too many redirects fetching ${url}`);
}

export async function httpGetText(
  url: string,
  headers: Record<string, string>,
): Promise<string> {
  const res = await httpGet(url, headers);
  if (res.status !== 200) {
    throw new Error(`GET ${url} -> ${res.status}`);
  }
  return res.body.toString("utf-8");
}
