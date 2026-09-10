"""极简静态服务器：把 src/ 目录挂到 http://localhost:8080
用法：python serve.py   （或双击 start-server.bat）"""
import http.server
import os
import socketserver

PORT = int(os.environ.get("PORT", 8080))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("Q版换装小游戏 -> http://localhost:%d/index.html" % PORT)
        print("关闭本窗口即停止服务。")
        httpd.serve_forever()
