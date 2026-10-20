"""在学校 Linux 服务器加载准确的 Docker 镜像，备份并更新 V1 容器。"""

import argparse
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import sqlite3
import subprocess
import sys
import tarfile
import urllib.request
import uuid


class DeploymentError(RuntimeError):
    pass


def check_database_state(root: Path) -> bool:
    """允许首次空目录初始化；已有部署缺失数据库时停下，避免误建空库。"""
    shared = root / "shared"
    database = shared / "data/ezdose.db"
    if database.is_file():
        return True
    has_deployment = (root / "current.json").exists() or (root / "previous.json").exists()
    has_files = any(any((shared / directory).iterdir()) for directory in ("data", "images"))
    if has_deployment or has_files:
        raise DeploymentError("已有部署记录或数据文件，但数据库缺失；请检查资料目录，不会自动重建空库。")
    return False


def read_configuration(root: Path) -> dict[str, str]:
    shared = root / "shared"
    if not (shared / "DEPLOYMENT_READY").is_file():
        raise DeploymentError("请先准备服务器配置和数据目录，再创建 shared/DEPLOYMENT_READY。")
    if not all((shared / directory).is_dir() for directory in ("data", "images")):
        raise DeploymentError("请先准备持久目录 shared/data 和 shared/images。")
    check_database_state(root)
    environment = shared / "server.env"
    if os.name == "posix" and environment.stat().st_mode & 0o077:
        raise DeploymentError("server.env 含密钥，请先执行 chmod 600。")
    # 显式默认值也会传给 Compose，避免继承 Runner 中偶然存在的同名环境变量。
    values = {"V1_BIND_ADDRESS": "127.0.0.1", "V1_PORT": "5068", "V1_THREADS": "4", "V1_URL_PREFIX": "/dispenser"}
    for line in environment.read_text(encoding="utf-8").splitlines():
        fields = shlex.split(line, comments=True)
        if not fields:
            continue
        if len(fields) != 1 or "=" not in fields[0]:
            raise DeploymentError("server.env 只能使用简单的 KEY=value 写法。")
        key, value = fields[0].split("=", 1)
        if key not in {"V1_SECRET_KEY", "V1_BIND_ADDRESS", "V1_PORT", "V1_THREADS", "V1_URL_PREFIX"}:
            raise DeploymentError("server.env 中有不支持的配置项。")
        values[key] = value
    if len(values.get("V1_SECRET_KEY", "")) < 32:
        raise DeploymentError("请设置至少 32 个字符的随机 V1_SECRET_KEY。")
    if values.get("V1_BIND_ADDRESS", "127.0.0.1") not in {"127.0.0.1", "0.0.0.0"}:
        raise DeploymentError("V1_BIND_ADDRESS 支持 127.0.0.1 或 0.0.0.0。")
    if not 1024 <= int(values.get("V1_PORT", "5068")) <= 65535:
        raise DeploymentError("宿主机端口必须在 1024–65535 内。")
    if not 1 <= int(values.get("V1_THREADS", "4")) <= 64:
        raise DeploymentError("V1_THREADS 必须在 1–64 内。")
    prefix = values["V1_URL_PREFIX"]
    if prefix and not re.fullmatch(r"(?:/[A-Za-z0-9_-]+)+", prefix):
        raise DeploymentError("V1_URL_PREFIX 须以 / 开头且不带末尾斜杠，例如 /dispenser；根路径部署时留空。")
    return values


def verify_latest_main(repository: str, revision: str) -> None:
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repository) or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise DeploymentError("仓库名称或版本格式不正确。")
    token = os.environ.get("GH_TOKEN")
    if not token:
        raise DeploymentError("缺少 GitHub 自动提供的只读令牌。")
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/git/ref/heads/main",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        current = json.load(response)["object"]["sha"]
    if current != revision:
        raise DeploymentError("main 已有更新，停止部署过时版本。")


def read_manifest(path: Path) -> dict[str, str]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if not re.fullmatch(r"[0-9a-f]{40}", manifest.get("revision", "")):
        raise DeploymentError("镜像清单的 Git 版本格式不正确。")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", manifest.get("image_id", "")):
        raise DeploymentError("镜像清单缺少有效的 Docker 镜像 ID。")
    if manifest.get("platform") not in {"linux/amd64", "linux/arm64"}:
        raise DeploymentError("镜像架构不受支持。")
    if not re.fullmatch(r"[0-9a-f]{64}", manifest.get("sha256", "")):
        raise DeploymentError("镜像清单缺少 SHA-256 校验值。")
    return manifest


def validate_artifact(artifact: Path, revision: str) -> dict[str, str]:
    manifest = read_manifest(artifact / "manifest.json")
    if manifest["revision"] != revision:
        raise DeploymentError("制品版本与通过 CI 的提交不一致。")
    digest = hashlib.sha256()
    with (artifact / "image.tar.gz").open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != manifest["sha256"]:
        raise DeploymentError("Docker 镜像文件 SHA-256 校验失败。")
    if not (artifact / "compose.yaml").is_file():
        raise DeploymentError("缺少容器运行配置。")
    return manifest


def docker_output(*arguments: str) -> str:
    return subprocess.check_output(["docker", *arguments], text=True).strip()


def docker_runtime() -> dict[str, str]:
    version = docker_output("compose", "version", "--short")
    numbers = re.match(r"v?(\d+)\.(\d+)", version)
    if not numbers or tuple(map(int, numbers.groups())) < (2, 24):
        raise DeploymentError("需要 Docker Compose 插件 2.24 或更新版本。")
    # Docker 的 DOCKER_CONTEXT 优先于 DOCKER_HOST，按相同顺序检查实际目标。
    context = os.environ.get("DOCKER_CONTEXT")
    if context:
        endpoint = json.loads(docker_output("context", "inspect", context, "--format", "{{json .Endpoints.docker.Host}}"))
    else:
        endpoint = os.environ.get("DOCKER_HOST") or json.loads(
            docker_output("context", "inspect", "--format", "{{json .Endpoints.docker.Host}}")
        )
    if not endpoint.startswith("unix://"):
        raise DeploymentError("必须使用学校服务器本机 Docker，不能指向远程 Docker context。")
    information = json.loads(docker_output("info", "--format", "{{json .}}"))
    architecture = {"x86_64": "amd64", "aarch64": "arm64"}.get(
        information["Architecture"], information["Architecture"],
    )
    if information["OSType"] != "linux" or architecture not in {"amd64", "arm64"}:
        raise DeploymentError("需要 Linux amd64 或 arm64 Docker 引擎。")
    rootless = any("rootless" in option for option in information.get("SecurityOptions", []))
    # Rootless 模式中的容器 UID 0 映射到部署账号；普通 Docker 则直接使用宿主机账号 ID。
    return {
        "platform": f"linux/{architecture}",
        "uid": "0" if rootless else str(os.getuid()),
        "gid": "0" if rootless else str(os.getgid()),
    }


def image_reference(manifest: dict[str, str]) -> str:
    # 同一提交重复构建可能产生不同内容；把镜像 ID 也放进标签，避免覆盖旧版本。
    return f"pillxa-v1:{manifest['revision']}-{manifest['image_id'][7:19]}"


def verify_image(manifest: dict[str, str]) -> None:
    image = json.loads(docker_output("image", "inspect", manifest["image_id"]))[0]
    if image["Id"] != manifest["image_id"] or f"{image['Os']}/{image['Architecture']}" != manifest["platform"]:
        raise DeploymentError("实际加载的镜像 ID 或架构不正确。")
    if image["Config"].get("Labels", {}).get("org.opencontainers.image.revision") != manifest["revision"]:
        raise DeploymentError("实际镜像的提交号不正确。")
    subprocess.run(["docker", "image", "tag", manifest["image_id"], image_reference(manifest)], check=True)


def compose(release: Path, root: Path, configuration: dict, runtime: dict, *arguments: str) -> None:
    manifest = read_manifest(release / "manifest.json")
    environment = os.environ.copy()
    environment.update(configuration)
    environment.update(
        V1_IMAGE=image_reference(manifest), V1_UID=runtime["uid"], V1_GID=runtime["gid"],
        V1_SHARED_DIRECTORY=str((root / "shared").resolve()),
    )
    # 凭据通过进程环境传给 Compose；不会写进制品或命令行参数。
    subprocess.run([
        "docker", "compose", "--project-name", "pillxa-v1", "--file", str(release / "compose.yaml"),
        *arguments,
    ], env=environment, check=True)


def start_release(release: Path, root: Path, configuration: dict, runtime: dict) -> None:
    # --wait 要求镜像中的 HTTP/数据库健康检查成功；仅创建出一个容器不算部署成功。
    compose(release, root, configuration, runtime, "up", "--detach", "--wait", "--wait-timeout", "90",
            "--no-build", "--pull", "never", "server")


def backup_data(root: Path, release_name: str) -> None:
    database_present = check_database_state(root)
    backup = root / "backups" / release_name
    backup.mkdir(parents=True)
    database = (root / "shared/data/ezdose.db").resolve()
    if database_present:
        with closing(sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True)) as source:
            if source.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise DeploymentError("原数据库完整性检查失败，停止部署。")
            with closing(sqlite3.connect(backup / "ezdose.db")) as destination:
                source.backup(destination)
    # 首次没有数据库时记录真实情况，由应用启动初始化，不伪造一个“数据库备份”。
    (backup / "backup.json").write_text(json.dumps({"database_present": database_present}) + "\n", encoding="utf-8")
    with tarfile.open(backup / "images.tar.gz", "w:gz") as images:
        images.add(root / "shared/images", arcname="images")


def write_state(path: Path, state: dict) -> None:
    temporary = path.with_name(f".{path.name}-{uuid.uuid4().hex}")
    temporary.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def previous_release(root: Path) -> Path | None:
    state = root / "current.json"
    if not state.is_file():
        return None
    name = json.loads(state.read_text(encoding="utf-8")).get("release", "")
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", name):
        raise DeploymentError("当前版本记录中的目录名不正确。")
    release = root / "releases" / name
    if not release.resolve().is_relative_to((root / "releases").resolve()) or not (release / "compose.yaml").is_file():
        raise DeploymentError("当前版本没有指向有效的部署记录。")
    read_manifest(release / "manifest.json")
    return release


def deploy(artifact: Path, revision: str, root: Path, repository: str) -> Path:
    configuration = read_configuration(root)
    manifest = validate_artifact(artifact, revision)
    verify_latest_main(repository, revision)
    runtime = docker_runtime()
    if runtime["platform"] != manifest["platform"]:
        raise DeploymentError("镜像与学校服务器架构不一致，请调整 V1_DOCKER_PLATFORM。")
    previous = previous_release(root)
    if previous:
        # 确认旧镜像仍然存在，再进入更新；避免更新失败时才发现无法回退。
        verify_image(read_manifest(previous / "manifest.json"))
    subprocess.run(["docker", "image", "load", "--input", str(artifact / "image.tar.gz")], check=True)
    verify_image(manifest)
    name = f"{revision[:12]}-{datetime.now(timezone.utc):%Y%m%dT%H%M%S}-{uuid.uuid4().hex[:8]}"
    release = root / "releases" / name
    release.mkdir(parents=True)
    for filename in ("compose.yaml", "manifest.json"):
        shutil.copyfile(artifact / filename, release / filename)
    verify_latest_main(repository, revision)

    try:
        compose(previous or release, root, configuration, runtime, "stop", "--timeout", "30", "server")
        backup_data(root, name)
        start_release(release, root, configuration, runtime)
        if previous:
            write_state(root / "previous.json", {"release": previous.name})
        # 只有新容器通过健康检查，才原子更新当前版本记录。
        write_state(root / "current.json", {"release": name})
    except Exception as original_error:
        try:
            compose(release, root, configuration, runtime, "stop", "--timeout", "30", "server")
            if previous:
                start_release(previous, root, configuration, runtime)
                print("新容器部署失败，旧版本容器已恢复。", flush=True)
            else:
                print("首次容器部署失败，服务已停止，数据保留。", flush=True)
        except Exception as rollback_error:
            raise DeploymentError("容器更新和程序回退均未完成，请检查 Docker 日志和 backups 目录。") from rollback_error
        raise DeploymentError(f"本次容器部署失败：{original_error}") from original_error
    print(f"V1 Docker 部署成功：{revision}", flush=True)
    return release


@contextmanager
def deployment_lock(root: Path):
    import fcntl

    with (root / ".deploy.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise DeploymentError("另一个部署正在运行。") from error
        yield


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", required=True, type=Path)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--repository", required=True)
    arguments = parser.parse_args()
    if sys.platform != "linux" or sys.version_info < (3, 10):
        raise SystemExit("学校部署工具需要 Linux 和 Python 3.10 或更新版本；应用 Python 3.12 在镜像内部。")
    if os.getuid() == 0:
        raise SystemExit("请使用经学校管理员授权的普通部署账号运行 Runner。")
    root = Path.home() / "projects" / "pillxa-dispenser" / "v1"
    if not root.is_dir():
        raise SystemExit("请先按 README 准备服务器目录与配置。")
    os.umask(0o077)

    def interrupted(signum, frame):
        raise DeploymentError("部署收到终止请求。")

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        with deployment_lock(root):
            deploy(arguments.artifact, arguments.revision, root, arguments.repository)
    except Exception as error:
        print(f"V1 Docker CD 失败：{error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
