#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde_json::{Value, json};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::Mutex,
};
use tauri::{Manager, State};
struct Machine {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    sequence: u64,
}
impl Machine {
    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.sequence += 1;
        let id = self.sequence;
        writeln!(
            self.input,
            "{}",
            json!({"id":id,"method":method,"params":params})
        )
        .and_then(|_| self.input.flush())
        .map_err(|e| e.to_string())?;
        let mut line = String::new();
        self.output
            .read_line(&mut line)
            .map_err(|e| e.to_string())?;
        if line.is_empty() {
            return Err("本机执行程序已停止，请重新打开应用核对现场".into());
        }
        let response: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        if response["id"] != id {
            return Err("本机响应顺序无效".into());
        }
        if let Some(error) = response["error"].as_str() {
            return Err(error.into());
        }
        Ok(response["result"].clone())
    }
}
impl Drop for Machine {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}
struct Host {
    machine: Mutex<Machine>,
    server: Mutex<Option<Child>>,
}
impl Host {
    fn shutdown(&self) {
        if let Ok(mut machine) = self.machine.lock() {
            if matches!(machine.child.try_wait(), Ok(None)) {
                let _ = machine.request("prepareExit", json!({}));
            }
            let _ = machine.child.kill();
            let _ = machine.child.wait();
        }
        if let Ok(mut server) = self.server.lock() {
            if let Some(mut child) = server.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}
impl Drop for Host {
    fn drop(&mut self) {
        self.shutdown();
    }
}
#[tauri::command]
async fn runtime_request(
    host: State<'_, Host>,
    method: String,
    params: Value,
) -> Result<Value, String> {
    host.machine
        .lock()
        .map_err(|_| "本机执行状态无法读取")?
        .request(&method, params)
}
fn hidden_command(path: PathBuf) -> Command {
    let mut command = Command::new(path);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    command
}
#[cfg(windows)]
fn round_window(window: &tauri::WebviewWindow) {
    use std::ffi::c_void;
    #[link(name = "dwmapi")]
    unsafe extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut c_void,
            attribute: u32,
            value: *const c_void,
            size: u32,
        ) -> i32;
    }
    if let Ok(hwnd) = window.hwnd() {
        let preference = 2u32; // DWMWCP_ROUND; Windows 11, unsupported versions keep their native frame.
        // Only this application's window is affected, not system settings.
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd.0 as *mut c_void,
                33,
                &preference as *const _ as *const c_void,
                4,
            );
        }
    }
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let resources = app.path().resource_dir()?.join("resources");
            // Portable trial writes only beside this executable. Installed builds use application data.
            let executable = std::env::current_exe()?;
            let portable = executable.parent().unwrap().join("portable.flag").exists();
            let data = if portable {
                executable.parent().unwrap().join("data")
            } else {
                app.path().app_data_dir()?
            };
            std::fs::create_dir_all(&data)?;
            let mut child = hidden_command(resources.join("pillxa-machine-runtime.exe"))
                .arg(data.join("runtime.sqlite"))
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()?;
            let machine = Machine {
                input: child.stdin.take().unwrap(),
                output: BufReader::new(child.stdout.take().unwrap()),
                child,
                sequence: 0,
            };
            let server = if std::net::TcpStream::connect_timeout(
                &"127.0.0.1:4310".parse().unwrap(),
                std::time::Duration::from_millis(200),
            )
            .is_err()
            {
                Some(
                    hidden_command(resources.join("node.exe"))
                        // Node 24 cannot resolve a namespaced Windows entry path:
                        // https://github.com/nodejs/node/issues/62446
                        .current_dir(resources.join("server"))
                        .arg("api.cjs")
                        .env("DATABASE_URL", data.join("trial.sqlite"))
                        .env(
                            "PILLXA_FONT_FILE",
                            resources.join("server/fonts/NotoSansCJKsc-Regular.otf"),
                        )
                        .env("PILLXA_TRIAL", "1")
                        .stdout(Stdio::null())
                        .stderr(Stdio::from(
                            std::fs::OpenOptions::new()
                                .create(true)
                                .append(true)
                                .open(data.join("server.log"))?,
                        ))
                        .spawn()?,
                )
            } else {
                None
            };
            app.manage(Host {
                machine: Mutex::new(machine),
                server: Mutex::new(server),
            });
            for _ in 0..40 {
                if std::net::TcpStream::connect_timeout(
                    &"127.0.0.1:4310".parse().unwrap(),
                    std::time::Duration::from_millis(100),
                )
                .is_ok()
                {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            let window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Pillxai Dispenser")
            .inner_size(1320.0, 900.0)
            .min_inner_size(900.0, 650.0)
            .data_directory(data.join("webview"))
            .build()?;
            #[cfg(windows)]
            round_window(&window);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![runtime_request])
        .build(tauri::generate_context!())
        .expect("Pillxai 启动失败")
        .run(|app, event| {
            // Tauri may exit without dropping managed state; close owned children explicitly.
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(host) = app.try_state::<Host>() {
                    host.shutdown();
                }
            }
        });
}
