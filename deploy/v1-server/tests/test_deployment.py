"""虚构资料下验证 Docker 部署，不连接真实 Docker 引擎或生产数据库。"""

from contextlib import closing
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_image
import check_web
import deploy as deployment
import run_server


OLD_REVISION = "a" * 40
NEW_REVISION = "b" * 40
TEST_ROOT = Path(__file__).resolve().parents[3] / ".tools/cd-tests"


class Fixtures(unittest.TestCase):
    def setUp(self):
        TEST_ROOT.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=TEST_ROOT)
        self.directory = Path(self.temporary.name).resolve()
        self.assertTrue(self.directory.is_relative_to(TEST_ROOT.resolve()))
        self.addCleanup(self.temporary.cleanup)
        self.artifact = self.directory / "artifact"
        self.artifact.mkdir()
        archive = self.artifact / "image.tar.gz"
        archive.write_bytes(b"synthetic image, not sent to Docker")
        self.manifest = {
            "revision": NEW_REVISION, "image_id": "sha256:" + "b" * 64,
            "platform": "linux/amd64", "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        }
        (self.artifact / "manifest.json").write_text(json.dumps(self.manifest))
        (self.artifact / "compose.yaml").write_text("services: {}\n")

    def shared_data(self):
        root = self.directory / "application"
        (root / "shared/data").mkdir(parents=True)
        (root / "shared/images").mkdir()
        (root / "shared/images/photo.png").write_bytes(b"preserved image")
        with closing(sqlite3.connect(root / "shared/data/ezdose.db")) as connection, connection:
            connection.execute("CREATE TABLE sample (value TEXT)")
            connection.execute("INSERT INTO sample VALUES ('preserved data')")
        (root / "shared/DEPLOYMENT_READY").touch()
        environment = root / "shared/server.env"
        environment.write_text("V1_SECRET_KEY=" + "s" * 48 + "\nV1_PORT=5068\n")
        environment.chmod(0o600)
        return root

    def patch(self, name, **options):
        patcher = mock.patch.object(deployment, name, **options)
        replacement = patcher.start()
        self.addCleanup(patcher.stop)
        return replacement


class PackageAndConfigurationTests(Fixtures):
    def test_context_contains_runtime_but_excludes_data_credentials_and_uploads(self):
        repository = self.directory / "repository"
        server = repository / "legacy/v1/server"
        for filename in (
            "main.py", "requirements.txt", "package.json", "package-lock.json", "tailwind.config.js",
            "templates/login.html", "static/src/main.css", "static/images/private.png",
            "static/.env", "static/private.key", "data/ezdose.db",
        ):
            path = server / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture")
        helper = repository / "deploy/v1-server"
        helper.mkdir(parents=True)
        for filename in ("Dockerfile", ".dockerignore", "run_server.py", "check_health.py", "check_web.py", "requirements-deploy.txt"):
            (helper / filename).write_text("fixture")
        context = build_image.prepare_context(repository, self.directory / "context", NEW_REVISION)
        self.assertTrue((context / "main.py").is_file())
        self.assertTrue((context / "static/src/main.css").is_file())
        for excluded in ("data", "static/images", "static/.env", "static/private.key"):
            self.assertFalse((context / excluded).exists())
        self.assertEqual((context / "REVISION").read_text().strip(), NEW_REVISION)

    def test_corrupt_image_is_rejected_before_docker(self):
        (self.artifact / "image.tar.gz").write_bytes(b"corrupt")
        with self.assertRaises(deployment.DeploymentError):
            deployment.validate_artifact(self.artifact, NEW_REVISION)

    def test_wrong_git_revision_is_rejected(self):
        with self.assertRaises(deployment.DeploymentError):
            deployment.validate_artifact(self.artifact, OLD_REVISION)

    def test_wrong_image_identity_is_rejected(self):
        image = {"Id": "sha256:" + "a" * 64, "Os": "linux", "Architecture": "amd64"}
        self.patch("docker_output", return_value=json.dumps([image]))
        with self.assertRaises(deployment.DeploymentError):
            deployment.verify_image(self.manifest)

    def test_missing_readiness_never_creates_an_empty_business_database(self):
        root = self.shared_data()
        (root / "shared/DEPLOYMENT_READY").unlink()
        with self.assertRaises(deployment.DeploymentError):
            deployment.read_configuration(root)

    def test_first_deployment_accepts_empty_directories_without_creating_database(self):
        root = self.shared_data()
        (root / "shared/data/ezdose.db").unlink()
        (root / "shared/images/photo.png").unlink()
        deployment.read_configuration(root)
        self.assertFalse((root / "shared/data/ezdose.db").exists())

    def test_first_deployment_with_unexplained_files_does_not_create_empty_database(self):
        root = self.shared_data()
        (root / "shared/data/ezdose.db").unlink()
        with self.assertRaises(deployment.DeploymentError):
            deployment.read_configuration(root)

    def test_missing_database_in_an_existing_deployment_is_rejected(self):
        root = self.shared_data()
        (root / "shared/data/ezdose.db").unlink()
        (root / "shared/images/photo.png").unlink()
        (root / "current.json").write_text(json.dumps({"release": "previous-version"}))
        with self.assertRaises(deployment.DeploymentError):
            deployment.read_configuration(root)

    def test_current_record_cannot_escape_release_directory(self):
        root = self.shared_data()
        (root / "current.json").write_text(json.dumps({"release": "../outside"}))
        with self.assertRaises(deployment.DeploymentError):
            deployment.previous_release(root)

    def test_rootless_docker_uses_container_uid_mapped_to_deploying_user(self):
        responses = ["2.24.0", json.dumps("unix:///run/user/1000/docker.sock"), json.dumps({
            "OSType": "linux", "Architecture": "aarch64", "SecurityOptions": ["name=rootless"],
        })]
        self.patch("docker_output", side_effect=responses)
        with mock.patch.dict(os.environ, {"DOCKER_HOST": "", "DOCKER_CONTEXT": ""}):
            runtime = deployment.docker_runtime()
        self.assertEqual(runtime, {"platform": "linux/arm64", "uid": "0", "gid": "0"})

    def test_remote_docker_context_is_rejected(self):
        self.patch("docker_output", side_effect=["2.24.0", json.dumps("ssh://another-machine")])
        with mock.patch.dict(os.environ, {"DOCKER_HOST": "", "DOCKER_CONTEXT": ""}):
            with self.assertRaises(deployment.DeploymentError):
                deployment.docker_runtime()

    def test_explicit_remote_context_is_not_hidden_by_a_local_docker_host(self):
        self.patch("docker_output", side_effect=["2.24.0", json.dumps("ssh://another-machine")])
        with mock.patch.dict(os.environ, {"DOCKER_HOST": "unix:///var/run/docker.sock", "DOCKER_CONTEXT": "remote"}):
            with self.assertRaises(deployment.DeploymentError):
                deployment.docker_runtime()

    def test_health_checks_real_sqlite_readability(self):
        root = self.directory / "health"
        (root / "data").mkdir(parents=True)
        (root / "REVISION").write_text(NEW_REVISION)
        self.assertEqual(run_server.health_status(root)[1], 503)
        with closing(sqlite3.connect(root / "data/ezdose.db")) as connection:
            connection.execute("CREATE TABLE sample (value TEXT)")
        self.assertEqual(run_server.health_status(root), ({"status": "ok", "revision": NEW_REVISION}, 200))
        (root / "data/ezdose.db").write_bytes(b"broken sqlite")
        self.assertEqual(run_server.health_status(root)[1], 503)

    def test_missing_secret_fails_before_loading_old_application(self):
        with mock.patch.dict(os.environ, {"V1_SECRET_KEY": ""}):
            with self.assertRaises(SystemExit):
                run_server.main()


class PublicPathTests(Fixtures):
    def test_existing_server_configuration_uses_school_public_path(self):
        self.assertEqual(deployment.read_configuration(self.shared_data())["V1_URL_PREFIX"], "/dispenser")

    def test_root_and_custom_public_paths_are_supported(self):
        root = self.shared_data()
        for prefix in ("", "/clinic/dispenser"):
            with self.subTest(prefix=prefix):
                with (root / "shared/server.env").open("a") as environment:
                    environment.write(f"V1_URL_PREFIX={prefix}\n")
                self.assertEqual(deployment.read_configuration(root)["V1_URL_PREFIX"], prefix)

    def test_invalid_public_path_is_rejected_before_deployment(self):
        root = self.shared_data()
        for prefix in ("dispenser", "/dispenser/", "//example.com", "/../dispenser", "https://example.com"):
            with self.subTest(prefix=prefix):
                with (root / "shared/server.env").open("a") as environment:
                    environment.write(f"V1_URL_PREFIX={prefix}\n")
                with self.assertRaises(deployment.DeploymentError):
                    deployment.read_configuration(root)

    def test_production_entry_overrides_the_legacy_template_and_redirect_prefix(self):
        for prefix in ("/dispenser", "", "/clinic/dispenser"):
            with self.subTest(prefix=prefix):
                application = SimpleNamespace(
                    URL_PREFIX="/nursing-rx", app=SimpleNamespace(config={}, add_url_rule=mock.Mock()),
                )
                serve = mock.Mock()
                with mock.patch.dict(sys.modules, {"main": application, "waitress": SimpleNamespace(serve=serve)}), \
                        mock.patch.dict(os.environ, {"V1_SECRET_KEY": "s" * 48, "V1_URL_PREFIX": prefix}), \
                        mock.patch.object(run_server.os, "chdir"):
                    run_server.main()
                self.assertEqual(application.URL_PREFIX, prefix)
                self.assertFalse(application.app.config["DEBUG"])
                self.assertIs(serve.call_args.args[0], application.app)

    def test_invalid_public_path_fails_before_loading_application(self):
        with mock.patch.dict(os.environ, {"V1_SECRET_KEY": "s" * 48, "V1_URL_PREFIX": "//example.com"}):
            with self.assertRaises(SystemExit):
                run_server.main()

    @staticmethod
    def response(body, content_type):
        response = io.BytesIO(body.encode("utf-8"))
        response.headers = {"Content-Type": content_type}
        return response

    def test_web_check_fetches_css_after_the_proxy_strips_the_public_path(self):
        html = '<link rel="stylesheet" href="https://fonts.example.com/font.css">' \
               '<link rel="stylesheet" href="/dispenser/static/dist/main.css?v=1">'
        responses = [self.response(html, "text/html"), self.response("body{color:black}", "text/css; charset=utf-8")]
        with mock.patch.object(check_web.urllib.request, "urlopen", side_effect=responses) as request:
            check_web.check_web("http://127.0.0.1:5068", "/dispenser")
        self.assertEqual([call.args[0] for call in request.call_args_list], [
            "http://127.0.0.1:5068/login", "http://127.0.0.1:5068/static/dist/main.css?v=1",
        ])

    def test_web_check_rejects_the_old_prefix_seen_in_the_school_page(self):
        response = self.response('<link rel="stylesheet" href="/nursing-rx/static/dist/main.css">', "text/html")
        with mock.patch.object(check_web.urllib.request, "urlopen", return_value=response):
            with self.assertRaisesRegex(RuntimeError, "CSS 地址"):
                check_web.check_web("http://127.0.0.1:5068", "/dispenser")

    def test_web_check_rejects_missing_or_non_css_styles(self):
        for css, content_type in (("<html>not found</html>", "text/html"), ("", "text/css")):
            with self.subTest(content_type=content_type, empty=not css):
                responses = [
                    self.response('<link rel="stylesheet" href="/dispenser/static/dist/main.css">', "text/html"),
                    self.response(css, content_type),
                ]
                with mock.patch.object(check_web.urllib.request, "urlopen", side_effect=responses):
                    with self.assertRaisesRegex(RuntimeError, "有效 CSS"):
                        check_web.check_web("http://127.0.0.1:5068", "/dispenser")

    def test_web_check_requires_a_local_stylesheet(self):
        with mock.patch.object(check_web.urllib.request, "urlopen", return_value=self.response("<html></html>", "text/html")):
            with self.assertRaisesRegex(RuntimeError, "没有引用本地 CSS"):
                check_web.check_web("http://127.0.0.1:5068", "/dispenser")


class ContainerUpdateTests(Fixtures):
    def setUp(self):
        super().setUp()
        self.root = self.shared_data()
        self.previous = self.root / "releases/previous-version"
        self.previous.mkdir(parents=True)
        old_manifest = {**self.manifest, "revision": OLD_REVISION, "image_id": "sha256:" + "a" * 64}
        (self.previous / "manifest.json").write_text(json.dumps(old_manifest))
        (self.previous / "compose.yaml").write_text("services: {}\n")
        deployment.write_state(self.root / "current.json", {"release": self.previous.name})
        self.latest = self.patch("verify_latest_main")
        self.runtime = self.patch("docker_runtime", return_value={"platform": "linux/amd64", "uid": "1000", "gid": "1000"})
        self.image = self.patch("verify_image")
        self.compose = self.patch("compose")
        self.start = self.patch("start_release")
        patcher = mock.patch.object(deployment.subprocess, "run")
        self.command = patcher.start()
        self.addCleanup(patcher.stop)

    def execute(self):
        return deployment.deploy(self.artifact, NEW_REVISION, self.root, "example/repository")

    def assert_data_preserved(self):
        with closing(sqlite3.connect(self.root / "shared/data/ezdose.db")) as connection:
            self.assertEqual(connection.execute("SELECT value FROM sample").fetchone()[0], "preserved data")
        self.assertEqual((self.root / "shared/images/photo.png").read_bytes(), b"preserved image")

    def test_success_records_new_version_and_backs_up_real_data(self):
        release = self.execute()
        self.assertEqual(deployment.previous_release(self.root), release)
        backup = next((self.root / "backups").iterdir())
        with closing(sqlite3.connect(backup / "ezdose.db")) as connection:
            self.assertEqual(connection.execute("SELECT value FROM sample").fetchone()[0], "preserved data")
        with tarfile.open(backup / "images.tar.gz") as images:
            self.assertIn("images/photo.png", images.getnames())
        self.assert_data_preserved()

    def test_image_load_failure_does_not_stop_working_container(self):
        self.command.side_effect = subprocess.CalledProcessError(1, ["docker", "image", "load"])
        with self.assertRaises(subprocess.CalledProcessError):
            self.execute()
        self.compose.assert_not_called()
        self.assertEqual(deployment.previous_release(self.root), self.previous)

    def test_architecture_mismatch_does_not_stop_working_container(self):
        self.runtime.return_value["platform"] = "linux/arm64"
        with self.assertRaises(deployment.DeploymentError):
            self.execute()
        self.command.assert_not_called()
        self.compose.assert_not_called()

    def test_new_commit_during_image_load_does_not_stop_old_container(self):
        self.latest.side_effect = [None, deployment.DeploymentError("new main")]
        with self.assertRaises(deployment.DeploymentError):
            self.execute()
        self.compose.assert_not_called()
        self.assertEqual(deployment.previous_release(self.root), self.previous)

    def test_unhealthy_new_container_restores_previous_and_keeps_shared_data(self):
        self.start.side_effect = [RuntimeError("unhealthy new container"), None]
        with self.assertRaises(deployment.DeploymentError):
            self.execute()
        self.assertEqual(self.start.call_args_list[-1].args[0], self.previous)
        self.assertEqual(deployment.previous_release(self.root), self.previous)
        self.assert_data_preserved()

    def test_backup_failure_does_not_start_new_version(self):
        with mock.patch.object(deployment, "backup_data", side_effect=OSError("disk full")):
            with self.assertRaises(deployment.DeploymentError):
                self.execute()
        self.assertEqual(self.start.call_args_list[0].args[0], self.previous)
        self.assertEqual(deployment.previous_release(self.root), self.previous)

    def test_first_deployment_failure_stops_new_container_and_preserves_data(self):
        (self.root / "current.json").unlink()
        self.start.side_effect = RuntimeError("unhealthy new container")
        with self.assertRaises(deployment.DeploymentError):
            self.execute()
        self.assertFalse((self.root / "current.json").exists())
        self.assertEqual(self.compose.call_args_list[-1].args[-4:], ("stop", "--timeout", "30", "server"))
        self.assert_data_preserved()

    def test_fresh_deployment_initializes_database_only_when_container_starts(self):
        (self.root / "current.json").unlink()
        (self.root / "shared/data/ezdose.db").unlink()
        (self.root / "shared/images/photo.png").unlink()

        def application_start(*arguments):
            self.assertFalse((self.root / "shared/data/ezdose.db").exists())
            with closing(sqlite3.connect(self.root / "shared/data/ezdose.db")) as connection, connection:
                connection.execute("CREATE TABLE sample (value TEXT)")
                connection.execute("INSERT INTO sample VALUES ('initialized by application')")

        self.start.side_effect = application_start
        release = self.execute()
        self.assertEqual(deployment.previous_release(self.root), release)
        backup = next((self.root / "backups").iterdir())
        self.assertEqual(json.loads((backup / "backup.json").read_text()), {"database_present": False})
        self.assertFalse((backup / "ezdose.db").exists())
        with closing(sqlite3.connect(self.root / "shared/data/ezdose.db")) as connection:
            self.assertEqual(connection.execute("SELECT value FROM sample").fetchone()[0], "initialized by application")

    def test_failed_fresh_start_retains_new_database_for_retry(self):
        (self.root / "current.json").unlink()
        (self.root / "shared/data/ezdose.db").unlink()
        (self.root / "shared/images/photo.png").unlink()

        def failed_application_start(*arguments):
            with closing(sqlite3.connect(self.root / "shared/data/ezdose.db")) as connection:
                connection.execute("CREATE TABLE sample (value TEXT)")
            raise RuntimeError("startup failed after initialization")

        self.start.side_effect = failed_application_start
        with self.assertRaises(deployment.DeploymentError):
            self.execute()
        self.assertFalse((self.root / "current.json").exists())
        self.assertTrue((self.root / "shared/data/ezdose.db").is_file())
        deployment.read_configuration(self.root)


if __name__ == "__main__":
    unittest.main()
