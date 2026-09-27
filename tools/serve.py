# Local dev server that tells the browser never to cache, so edits show up on a normal reload.
#   python3 tools/serve.py [port]
import http.server, sys, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

os.chdir(os.path.join(os.path.dirname(__file__), '..'))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8347
http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
