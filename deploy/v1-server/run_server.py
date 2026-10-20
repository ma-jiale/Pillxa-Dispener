"""V1 的生产启动入口；不运行 main.py 中开启 debug 的开发服务器。"""

from contextlib import closing
import os
from pathlib import Path
import re
import sqlite3


def health_status(root: Path) -> tuple[dict, int]:
    """同时确认版本与 SQLite 可读，避免把另一个占用同端口的服务当成部署成功。"""
    try:
        database = (root / "data/ezdose.db").resolve()
        with closing(sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True, timeout=2)) as connection:
            connection.execute("PRAGMA schema_version").fetchone()
        revision = (root / "REVISION").read_text(encoding="utf-8").strip()
        return {"status": "ok", "revision": revision}, 200
    except (OSError, sqlite3.Error):
        return {"status": "unavailable"}, 503


def main() -> None:
    secret = os.environ.get("V1_SECRET_KEY", "")
    if len(secret) < 32:
        raise SystemExit("V1_SECRET_KEY 必须由服务器配置，且至少包含 32 个字符。")
    prefix = os.environ.get("V1_URL_PREFIX", "/dispenser")
    if prefix and not re.fullmatch(r"(?:/[A-Za-z0-9_-]+)+", prefix):
        raise SystemExit("V1_URL_PREFIX 须为 /dispenser 这样的路径，不带末尾斜杠；根路径部署时留空。")

    root = Path(__file__).resolve().parent
    # 旧入口按当前工作目录读写 data 和 static/images，因此必须固定工作目录。
    os.chdir(root)
    # 延迟导入：先验证配置，再让旧应用按原有入口初始化数据库。
    import main as application
    from waitress import serve

    # 学校代理把 /dispenser/login 转发为 /login；应用路由保持原样。
    # 旧应用用模块中的 URL_PREFIX 生成模板资源和跳转地址，部署时统一覆盖为公开路径。
    application.URL_PREFIX = prefix
    app = application.app
    app.config.update(SECRET_KEY=secret, DEBUG=False, TESTING=False)
    app.add_url_rule("/__deployment_health", "deployment_health", lambda: health_status(root))
    serve(
        app,
        host=os.environ.get("V1_HOST", "127.0.0.1"),
        port=int(os.environ.get("V1_PORT", "5068")),
        threads=int(os.environ.get("V1_THREADS", "4")),
        expose_tracebacks=False,
    )


if __name__ == "__main__":
    main()
