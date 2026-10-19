"""Docker 健康检查：必须由 HTTP 返回本镜像的版本，且数据库可读。"""

import json
from pathlib import Path
import sys
import urllib.request


def main() -> int:
    try:
        with urllib.request.urlopen("http://127.0.0.1:5068/__deployment_health", timeout=3) as response:
            status = json.load(response)
        revision = Path(__file__).with_name("REVISION").read_text(encoding="utf-8").strip()
        return 0 if status.get("status") == "ok" and status.get("revision") == revision else 1
    except (OSError, ValueError):
        return 1


if __name__ == "__main__":
    sys.exit(main())
