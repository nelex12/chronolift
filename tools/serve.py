"""Сервер игры для разработки и тестов: python tools/serve.py  (порт 8321, папка game/).

Обычный `python -m http.server` держит очередь всего из 5 соединений: когда тесты открывают
несколько браузеров разом (test/run_all.js), часть запросов отбрасывается, и страница
не догружает скрипты. Здесь очередь больше, каждый запрос — в своём потоке, кэш отключён,
чтобы браузер всегда брал свежие файлы.
"""
import functools
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8321
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'game')


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


if __name__ == '__main__':
    with Server(('127.0.0.1', PORT), functools.partial(Handler, directory=ROOT)) as s:
        print(f'http://127.0.0.1:{PORT}/index.html', flush=True)
        s.serve_forever()
