/*
  Serves the demo video with byte-range support. Cloudflare's static assets
  answered a Range request with the whole file (200), and iPhone/Safari won't
  play a video without proper 206 partial responses. Everything else is served
  straight from the static assets.
*/
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.endsWith(".mp4")) return env.ASSETS.fetch(request);
    const full = await env.ASSETS.fetch(new Request(url.toString(), { method: "GET" }));
    if (!full.ok) return full;
    const buf = await full.arrayBuffer();
    const size = buf.byteLength;
    const base = { "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "public, max-age=3600" };
    const range = request.headers.get("range");
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m) return new Response(request.method === "HEAD" ? null : buf, { status: 200, headers: { ...base, "content-length": String(size) } });
    let start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    let end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...base, "content-range": "bytes */" + size } });
    return new Response(request.method === "HEAD" ? null : buf.slice(start, end + 1), {
      status: 206, headers: { ...base, "content-length": String(end - start + 1), "content-range": "bytes " + start + "-" + end + "/" + size },
    });
  },
};
