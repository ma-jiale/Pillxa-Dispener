"""准备最小构建上下文，再把 Docker 镜像和部署清单交给学校服务器。"""

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import time
import uuid


def prepare_context(repository: Path, output: Path, revision: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("必须提供完整的 40 位 Git 提交号。")
    output.mkdir(parents=True, exist_ok=False)
    server = repository / "legacy/v1/server"
    deployment = repository / "deploy/v1-server"
    files = {name: server / name for name in (
        "main.py", "requirements.txt", "package.json", "package-lock.json", "tailwind.config.js",
    )}
    for directory in ("templates", "static"):
        (output / directory).mkdir()
        for source in sorted((server / directory).rglob("*")):
            relative = source.relative_to(server)
            if relative.parts[:2] == ("static", "images"):
                continue
            if any(part.startswith(".") or part in {"__pycache__", "node_modules"} for part in relative.parts):
                continue
            if source.suffix.lower() in {".db", ".sqlite", ".sqlite3", ".pyc", ".key", ".pem"}:
                continue
            if source.is_file():
                files[relative.as_posix()] = source
    for name in ("Dockerfile", ".dockerignore", "run_server.py", "check_health.py", "check_web.py", "requirements-deploy.txt"):
        files[name] = deployment / name
    for name, source in files.items():
        if source.is_symlink():
            raise ValueError(f"构建文件不能是符号链接：{name}")
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    (output / "REVISION").write_text(f"{revision}\n", encoding="utf-8")
    return output


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def smoke_image(tag: str, platform: str, temporary_root: Path) -> None:
    """在 GitHub 临时机实际启动新镜像；使用全新虚构目录，不连接学校数据库。"""
    with tempfile.TemporaryDirectory(prefix="v1-image-smoke-", dir=temporary_root) as directory:
        root = Path(directory).resolve()
        if not root.is_relative_to(temporary_root.resolve()):
            raise ValueError("镜像测试目录越界。")
        (root / "data").mkdir()
        (root / "images").mkdir()
        name = f"v1-smoke-{uuid.uuid4().hex}"
        environment = {**os.environ, "V1_SECRET_KEY": secrets.token_urlsafe(48)}
        try:
            subprocess.run([
                "docker", "run", "--detach", "--name", name, "--platform", platform,
                "--user", f"{os.getuid()}:{os.getgid()}", "--read-only", "--tmpfs", "/tmp",
                "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                "--env", "V1_SECRET_KEY", "--env", "V1_HOST=0.0.0.0",
                "--mount", f"type=bind,source={root / 'data'},target=/app/data",
                "--mount", f"type=bind,source={root / 'images'},target=/app/static/images", tag,
            ], env=environment, check=True)
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                state = json.loads(subprocess.check_output(["docker", "inspect", name], text=True))[0]["State"]
                if state.get("Health", {}).get("Status") == "healthy":
                    # 健康接口通过后还须检查网页，防止 CSS 前缀写错仍被发布。
                    subprocess.run(["docker", "exec", name, "python", "check_web.py"], check=True)
                    return
                if state["Status"] in {"exited", "dead"}:
                    break
                time.sleep(2)
            raise RuntimeError("新镜像的隔离启动与健康检查未通过，不导出部署制品。")
        finally:
            # 只清理本函数创建且名称随机的测试容器，不处理其他容器或 Docker 数据卷。
            subprocess.run(["docker", "container", "rm", "--force", name], check=False)


def build_image(repository: Path, output: Path, revision: str, platform: str) -> None:
    if platform not in {"linux/amd64", "linux/arm64"}:
        raise ValueError("镜像平台只支持 linux/amd64 或 linux/arm64。")
    output.mkdir(parents=True, exist_ok=False)
    context = prepare_context(repository, output.parent / f"{output.name}-context", revision)
    tag = f"pillxa-v1:{revision}"
    subprocess.run([
        "docker", "buildx", "build", "--load", "--platform", platform,
        "--build-arg", f"V1_REVISION={revision}", "--tag", tag, str(context),
    ], check=True)
    image = json.loads(subprocess.check_output(["docker", "image", "inspect", tag], text=True))[0]
    image_id = image["Id"]
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", image_id):
        raise ValueError("Docker 没有返回有效的镜像 ID。")
    if f"{image['Os']}/{image['Architecture']}" != platform:
        raise ValueError("实际镜像架构与配置不一致。")
    if image["Config"]["Labels"].get("org.opencontainers.image.revision") != revision:
        raise ValueError("镜像的版本标签与通过 CI 的提交不一致。")
    smoke_image(tag, platform, output.parent)
    archive = output / "image.tar.gz"
    # docker save 导出完整镜像；gzip 流式压缩，不把整个镜像放入 Python 内存。
    with subprocess.Popen(["docker", "image", "save", tag], stdout=subprocess.PIPE) as process:
        with gzip.open(archive, "wb") as destination:
            shutil.copyfileobj(process.stdout, destination)
        if process.wait() != 0:
            raise RuntimeError("Docker 镜像导出失败。")
    manifest = {"revision": revision, "image_id": image_id, "platform": platform, "sha256": sha256_file(archive)}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for name in ("deploy.py", "compose.yaml"):
        shutil.copyfile(repository / "deploy/v1-server" / name, output / name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--platform", default="linux/amd64")
    arguments = parser.parse_args()
    build_image(Path(__file__).resolve().parents[2], arguments.output, arguments.revision, arguments.platform)
