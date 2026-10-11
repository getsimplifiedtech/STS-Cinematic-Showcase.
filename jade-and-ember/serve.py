#!/usr/bin/env python3
"""Tiny local server for the Jade & Ember preview. Standard library only. Supports HTTP Range so the hero video can loop and seek.
Usage: python3 serve.py [port] [host]   (then open http://localhost:8766/)
The host defaults to 127.0.0.1 (this computer only). To reach it from a phone on a trusted network: python3 serve.py 8766 0.0.0.0"""
import http.server, os, re, sys

class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.webm': 'video/webm', '.mp4': 'video/mp4', '.webp': 'image/webp', '.woff2': 'font/woff2', '.js': 'text/javascript'}
    def send_head(self):
        rng = self.headers.get('Range')
        path = self.translate_path(self.path)
        m = re.match(r'bytes=(\d*)-(\d*)$', rng or '')
        if not m or not os.path.isfile(path) or not (m.group(1) or m.group(2)):
            return super().send_head()
        size = os.path.getsize(path)
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2)))
        end = min(int(m.group(2)), size - 1) if m.group(1) and m.group(2) else size - 1
        f = open(path, 'rb'); f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        self._left = end - start + 1
        return f
    def copyfile(self, source, outputfile):
        left = getattr(self, '_left', None)
        if left is None: return super().copyfile(source, outputfile)
        while left > 0:
            chunk = source.read(min(65536, left))
            if not chunk: break
            outputfile.write(chunk); left -= len(chunk)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
    print(f'Jade & Ember local preview: http://localhost:{port}/   (Ctrl+C to stop)' + ('' if host == '127.0.0.1' else f'   listening on {host}: any device on this network can open it'))
    http.server.ThreadingHTTPServer((host, port), H).serve_forever()
