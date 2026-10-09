// Tiny static server for the tests: correct media types and HTTP Range support (browsers need it to seek in video).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webm': 'video/webm', '.mp4': 'video/mp4' };

export function serve(root = process.cwd()) {
  const log = [];                                  // { url, t } for every request, so tests can assert what was (not) fetched
  const server = createServer(async (req, res) => {
    try {
      let p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
      if (p.endsWith('/') || p === '.') p = '/index.html';
      const body = await readFile(join(root, p));
      const type = types[extname(p)] || 'application/octet-stream';
      log.push({ url: p, t: Date.now() });
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m && (m[1] || m[2])) {
        const start = m[1] ? +m[1] : Math.max(0, body.length - +m[2]);
        const end = m[1] && m[2] ? Math.min(+m[2], body.length - 1) : body.length - 1;
        res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': end - start + 1 });
        res.end(body.subarray(start, end + 1));
      } else {
        res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': body.length });
        res.end(body);
      }
    } catch { res.writeHead(404); res.end('nf'); }
  }).listen(0);
  return { server, log, base: `http://127.0.0.1:${server.address().port}/` };
}
