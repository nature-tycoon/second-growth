# Local dev server that tells the browser never to cache, so edits show up on a normal reload.
#   python3 tools/serve.py [port]   (or the PORT environment variable; 8347 by default)
import http.server, sys, os, io

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        if not getattr(self, 'ranged', None): self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    # Byte ranges (Range: bytes=a-b), as GitHub Pages serves them: Safari plays a video only when the
    # server answers its range requests (the website's loops, tools/website-video-review.html).
    def send_head(self):
        self.ranged = None
        r = self.headers.get('Range', '')
        path = self.translate_path(self.path)
        if not r.startswith('bytes=') or ',' in r or not os.path.isfile(path): return super().send_head()
        size = os.path.getsize(path)
        a, _, b = r[6:].partition('-')
        start, end = (size - int(b), size - 1) if not a else (int(a), min(int(b), size - 1) if b else size - 1)
        if start < 0 or start > end:
            self.send_error(416); return None
        with open(path, 'rb') as f:
            f.seek(start); data = f.read(end - start + 1)
        self.ranged = (start, end)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        return io.BytesIO(data)

os.chdir(os.path.join(os.path.dirname(__file__), '..'))
port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', 8347))
http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
