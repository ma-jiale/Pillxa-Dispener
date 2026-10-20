"""镜像发布前检查登录页的本地 CSS 路径与内容，避免服务健康但页面没有样式。"""

from html.parser import HTMLParser
import os
import sys
from urllib.parse import urlsplit, urlunsplit
import urllib.request


class Stylesheets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == "link" and "stylesheet" in attributes.get("rel", "").split():
            if attributes.get("href"):
                self.urls.append(attributes["href"])


def check_web(base_url: str, prefix: str) -> None:
    with urllib.request.urlopen(base_url + "/login", timeout=5) as response:
        html = response.read().decode("utf-8")
    stylesheets = Stylesheets()
    stylesheets.feed(html)
    local_stylesheets = 0
    for url in stylesheets.urls:
        target = urlsplit(url)
        # 外部字体不在本镜像内；只检查由学校服务器提供的样式。
        if target.scheme or target.netloc:
            continue
        if not target.path.startswith(prefix + "/"):
            raise RuntimeError(f"登录页 CSS 地址与公开前缀 {prefix!r} 不匹配：{url}")
        # 模拟学校代理：去掉公开前缀，再请求容器内部的同一资源。
        internal_path = urlunsplit(("", "", target.path[len(prefix):], target.query, ""))
        with urllib.request.urlopen(base_url + internal_path, timeout=5) as response:
            if response.headers.get("Content-Type", "").split(";", 1)[0] != "text/css" or not response.read().strip():
                raise RuntimeError(f"登录页样式没有返回有效 CSS：{url}")
        local_stylesheets += 1
    if not local_stylesheets:
        raise RuntimeError("登录页没有引用本地 CSS。")


def main() -> int:
    try:
        check_web(
            "http://127.0.0.1:" + os.environ.get("V1_PORT", "5068"),
            os.environ.get("V1_URL_PREFIX", "/dispenser"),
        )
        print("登录页及本地 CSS 检查通过。")
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        print(f"登录页检查失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
