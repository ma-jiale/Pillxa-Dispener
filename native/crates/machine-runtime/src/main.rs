use chrono::Utc;
use reqwest::blocking::Client;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use uuid::Uuid;
mod protocol;
#[cfg(test)]
mod test_port;
use std::io::Read;

fn timestamp() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Configuration {
    api_url: String,
    token: String,
    institution_id: String,
    terminal_id: String,
    device_id: String,
    #[serde(default)]
    rfid_bindings: std::collections::HashMap<String, String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    task_id: String,
    plan: Value,
    phase: String,
    batch_index: usize,
    count: u64,
    results: Vec<Value>,
    identified_resident_id: Option<String>,
    #[serde(default)]
    box_prepared: bool,
    #[serde(default)]
    identification_issue: Option<String>,
    #[serde(default)]
    identification_sources: std::collections::BTreeMap<String, Value>,
    #[serde(default)]
    gate_overrides: std::collections::BTreeMap<String, f64>,
    #[serde(default)]
    gate_value: Option<f64>,
    #[serde(default)]
    pending_resolution: Option<PendingResolution>,
    has_started: bool,
    connected: bool,
    mode: String,
    sequence: u64,
    pending_sync: u64,
    error: Option<String>,
    device_id: String,
    terminal_id: String,
    last_updated: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingResolution {
    batch_id: String,
    status: String,
    reason: String,
    step: ResolutionStep,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ResolutionStep {
    WaitingStopAck,
    WaitingExitAck,
    WaitingExitDone,
}
struct Runtime {
    db: Connection,
    config: Option<Configuration>,
    state: Option<Snapshot>,
    online: bool,
    ticks: u8,
    serial: Option<Box<dyn serialport::SerialPort>>,
    mode: String,
    port: String,
    input_buffer: Vec<u8>,
    last_uid: Option<String>,
}
impl Runtime {
    fn open(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let db = Connection::open(path).map_err(|e| e.to_string())?;
        db.execute_batch("PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,body TEXT NOT NULL,synced INTEGER NOT NULL DEFAULT 0);CREATE TABLE IF NOT EXISTS configuration(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL);").map_err(|e|e.to_string())?;
        db.execute_batch("CREATE TABLE IF NOT EXISTS diagnostics(id INTEGER PRIMARY KEY,received_at TEXT,raw TEXT,task_id TEXT)").map_err(|e|e.to_string())?;
        let has_task_id = db
            .prepare("PRAGMA table_info(diagnostics)")
            .map_err(|e| e.to_string())?
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .any(|name| name.is_ok_and(|name| name == "task_id"));
        if !has_task_id {
            db.execute_batch("ALTER TABLE diagnostics ADD COLUMN task_id TEXT")
                .map_err(|e| e.to_string())?;
        }
        let state: Option<Snapshot> = db
            .query_row("SELECT body FROM state WHERE id=1", [], |row| {
                row.get::<_, String>(0)
            })
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok());
        let config: Option<Configuration> = db
            .query_row("SELECT body FROM configuration WHERE id=1", [], |row| {
                row.get::<_, String>(0)
            })
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok());
        let mut runtime = Self {
            db,
            config,
            state,
            online: true,
            ticks: 0,
            serial: None,
            mode: "simulator".into(),
            port: String::new(),
            input_buffer: vec![],
            last_uid: None,
        };
        if let Some(state) = runtime.state.as_mut() {
            runtime.mode = state.mode.clone();
            state.connected = state.mode == "simulator";
            if ["ready", "tray_change"].contains(&state.phase.as_str()) {
                state.box_prepared = false;
                state.identified_resident_id = None;
                state.identification_sources.clear();
                state.identification_issue = None;
            }
            if ["running", "paused", "review", "resolving"].contains(&state.phase.as_str())
                && state.has_started
            {
                state.phase = "interrupted".into();
                state.pending_resolution = None;
                state.error = Some("程序重启，请核对现场后处理当前药物".into());
            }
        }
        runtime.save()?;
        Ok(runtime)
    }
    fn save(&mut self) -> Result<(), String> {
        if let Some(state) = self.state.as_mut() {
            state.pending_sync = self
                .db
                .query_row(
                    "SELECT COUNT(*) FROM outbox WHERE synced=0 AND task_id=?",
                    [&state.task_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            state.last_updated = timestamp();
            self.db.execute("INSERT INTO state(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",[serde_json::to_string(state).unwrap()]).map_err(|e|e.to_string())?;
        }
        Ok(())
    }
    fn event(&mut self, kind: &str, data: Value) -> Result<(), String> {
        let state = self.state.as_mut().ok_or("当前没有任务")?;
        state.sequence += 1;
        let event = json!({"id":Uuid::new_v4().to_string(),"sequence":state.sequence,"taskId":state.task_id,"institutionId":state.plan["institutionId"],"terminalId":state.terminal_id,"deviceId":state.device_id,"type":kind,"data":data,"receivedAt":timestamp()});
        let tx = self.db.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO outbox(id,task_id,body,synced) VALUES(?,?,?,0)",
            params![
                event["id"].as_str().unwrap(),
                state.task_id,
                event.to_string()
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO state(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",[serde_json::to_string(state).unwrap()]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        self.save()
    }
    fn batch(&self) -> Result<Value, String> {
        let s = self.state.as_ref().ok_or("没有任务")?;
        s.plan["batches"]
            .as_array()
            .and_then(|b| b.get(s.batch_index))
            .cloned()
            .ok_or("没有当前药物".into())
    }
    fn observe_box(
        &mut self,
        source: &str,
        resident: Option<String>,
        raw: &str,
        absent: bool,
    ) -> Result<(), String> {
        let Some(s) = self.state.as_mut() else {
            return Ok(());
        };
        if !["ready", "tray_change"].contains(&s.phase.as_str()) || !s.box_prepared {
            return Ok(());
        }
        if !["barcode", "rfid", "simulator"].contains(&source) {
            return Err("无效识别来源".into());
        }
        let observation = json!({"residentId":resident,"raw":raw});
        if absent {
            if s.identification_sources.remove(source).is_none() {
                return Ok(());
            }
        } else {
            if s.identification_sources.get(source) == Some(&observation) {
                return Ok(());
            }
            s.identification_sources.insert(source.into(), observation);
        }
        let expected = s.plan["residentId"].as_str().unwrap_or("");
        let ids: std::collections::BTreeSet<&str> = s
            .identification_sources
            .values()
            .filter_map(|value| value["residentId"].as_str())
            .collect();
        s.identified_resident_id = None;
        s.identification_issue = if ids.len() > 1 {
            Some("药盒标识不一致，请移开药盒并核对标签后重新放入".into())
        } else if ids.iter().any(|id| *id != expected) {
            Some("药盒属于另一位住民，请更换药盒".into())
        } else if ids.contains(expected) {
            s.identified_resident_id = Some(expected.into());
            None
        } else if !s.identification_sources.is_empty() {
            Some("药盒标识尚未绑定，请在住民资料中完成绑定".into())
        } else {
            None
        };
        self.event(
            "box.observed",
            json!({"source":source,"raw":raw,"residentId":resident,"absent":absent}),
        )
    }
    fn result(&mut self, status: &str, reason: &str) -> Result<(), String> {
        let batch = self.batch()?;
        let state = self.state.as_mut().unwrap();
        let result = json!({"batchId":batch["id"],"status":status,"count":if status=="manual" {batch["target"].as_u64().unwrap_or(0)}else{state.count},"reason":reason});
        state.results.push(result.clone());
        let s = self.state.as_mut().unwrap();
        let batches = s.plan["batches"].as_array().unwrap();
        if s.batch_index + 1 >= batches.len() {
            s.phase = "take_out".into();
        } else {
            let next = &batches[s.batch_index + 1];
            s.phase = if next["tray"] != batch["tray"] {
                "tray_change"
            } else {
                "next_drug"
            }
            .into();
        }
        s.error = None;
        if s.phase == "tray_change" {
            s.identified_resident_id = None;
            s.identification_sources.clear();
            s.identification_issue = None;
            s.box_prepared = false;
        }
        self.event("batch.result", result)?;
        if ["tray_change", "take_out"].contains(&self.state.as_ref().unwrap().phase.as_str()) {
            if let Err(error) = self.send(protocol::frame(3, &[])) {
                self.state.as_mut().unwrap().error =
                    Some(format!("开仓请求失败：{error}。请连接设备后重新开仓。"));
                self.save()?;
                return Err(error);
            }
            self.event(
                "box.open_requested",
                json!({"source":self.mode,"reason":"tray_finished"}),
            )?;
            if self.state.as_ref().unwrap().phase == "tray_change" {
                self.state.as_mut().unwrap().box_prepared = true;
                self.save()?;
            }
        }
        Ok(())
    }
    fn send(&mut self, bytes: Vec<u8>) -> Result<(), String> {
        if self.mode == "simulator" {
            return Ok(());
        }
        let sent = match self.serial.as_mut() {
            Some(port) => port.write_all(&bytes).and_then(|_| port.flush()),
            None => Err(io::Error::new(io::ErrorKind::NotConnected, "串口尚未连接")),
        };
        if let Err(error) = sent {
            self.serial = None;
            self.input_buffer.clear();
            if let Some(s) = self.state.as_mut() {
                s.connected = false;
                s.pending_resolution = None;
                if ["running", "paused", "review", "resolving"].contains(&s.phase.as_str()) {
                    s.phase = "interrupted".into();
                }
                s.error = Some(format!("设备连接中断：{error}。请重新连接并核对现场。"));
                self.event(
                    "device.disconnected",
                    json!({"reason":error.to_string(),"during":"write"}),
                )?;
            }
            return Err(format!("串口写入失败：{error}"));
        }
        if self.state.is_some() {
            self.event("device.sent", json!({"bytes":bytes,"source":"serial"}))?;
        }
        Ok(())
    }
    fn advance_resolution(&mut self, feedback: &str) -> Result<(), String> {
        let pending = self
            .state
            .as_ref()
            .filter(|s| s.phase == "resolving")
            .and_then(|s| s.pending_resolution.clone());
        let Some(pending) = pending else {
            return Ok(());
        };
        match (pending.step, feedback) {
            (ResolutionStep::WaitingStopAck, "ack") => {
                self.state
                    .as_mut()
                    .unwrap()
                    .pending_resolution
                    .as_mut()
                    .unwrap()
                    .step = ResolutionStep::WaitingExitAck;
                if let Err(error) = self.send(protocol::frame(0, &[])) {
                    let s = self.state.as_mut().unwrap();
                    s.phase = "interrupted".into();
                    s.pending_resolution = None;
                    s.error = Some(format!("退出药物请求失败：{error}，请核对现场后重试处理。"));
                    self.save()?;
                    return Err(error);
                }
                self.event("batch.exit_requested", json!({"batchId":pending.batch_id}))?;
            }
            (ResolutionStep::WaitingExitAck, "ack") => {
                self.state
                    .as_mut()
                    .unwrap()
                    .pending_resolution
                    .as_mut()
                    .unwrap()
                    .step = ResolutionStep::WaitingExitDone;
                self.event("batch.exit_accepted", json!({"batchId":pending.batch_id}))?;
            }
            (ResolutionStep::WaitingExitDone, "done") => {
                self.state.as_mut().unwrap().pending_resolution = None;
                self.event("batch.exit_completed", json!({"batchId":pending.batch_id}))?;
                self.result(&pending.status, &pending.reason)?;
            }
            _ => {}
        }
        Ok(())
    }
    fn receive(&mut self) -> Result<(), String> {
        let Some(port) = self.serial.as_mut() else {
            return Ok(());
        };
        let mut bytes = [0u8; 1024];
        match port.read(&mut bytes) {
            Ok(count) => self.input_buffer.extend_from_slice(&bytes[..count]),
            Err(error) if error.kind() == io::ErrorKind::TimedOut => {}
            Err(error) => {
                self.serial = None;
                if let Some(s) = self.state.as_mut() {
                    s.connected = false;
                    s.pending_resolution = None;
                    if s.has_started
                        && ["running", "paused", "review", "resolving", "interrupted"]
                            .contains(&s.phase.as_str())
                    {
                        s.phase = "interrupted".into();
                        s.error = Some(format!("串口中断：{error}"));
                    }
                    self.event("device.disconnected", json!({"reason":error.to_string()}))?;
                }
                return Ok(());
            }
        }
        while let Some(end) = self.input_buffer.iter().position(|b| *b == b'\n') {
            let line =
                String::from_utf8_lossy(&self.input_buffer.drain(..=end).collect::<Vec<_>>())
                    .trim()
                    .to_string();
            if line.is_empty() {
                continue;
            }
            self.db.execute("CREATE TABLE IF NOT EXISTS diagnostics(id INTEGER PRIMARY KEY,received_at TEXT,raw TEXT)",[]).map_err(|e|e.to_string())?;
            self.db
                .execute(
                    "INSERT INTO diagnostics(received_at,raw,task_id) VALUES(?,?,?)",
                    params![timestamp(), line, self.state.as_ref().map(|s| &s.task_id)],
                )
                .map_err(|e| e.to_string())?;
            let parsed = protocol::parse(&line);
            if self.state.is_some() {
                self.event(
                    "device.raw",
                    json!({"line":line,"parsed":parsed,"source":"serial"}),
                )?;
            }
            self.advance_resolution(parsed["type"].as_str().unwrap_or(""))?;
            if parsed["type"] == "uid" {
                self.last_uid = parsed["uid"].as_str().map(str::to_string);
                let resident = self.config.as_ref().and_then(|c| {
                    c.rfid_bindings
                        .get(parsed["uid"].as_str().unwrap_or(""))
                        .cloned()
                });
                self.observe_box("rfid", resident, &line, false)?;
            }
            if parsed["type"] == "absent" {
                self.last_uid = None;
                self.observe_box("rfid", None, &line, true)?;
            }
            let Some(s) = self.state.as_ref() else {
                continue;
            };
            let active = ["running", "paused"].contains(&s.phase.as_str());
            let resolving = s.phase == "resolving";
            let interrupted = s.phase == "interrupted";
            if parsed["type"] == "progress" && (active || resolving) {
                let count = parsed["count"].as_u64().unwrap_or(0);
                let target = self.batch()?["target"].as_u64().unwrap_or(0);
                let s = self.state.as_mut().unwrap();
                if count < s.count || count > target {
                    s.phase = "review".into();
                    s.pending_resolution = None;
                    s.error = Some("机器计数与当前批次不符，请核对".into());
                    self.send(protocol::parameter(0, 0.0))?;
                } else {
                    s.count = count;
                    self.event("device.progress", parsed.clone())?;
                }
            }
            if parsed["type"] == "finish" && active {
                let batch = self.batch()?;
                if self.state.as_ref().unwrap().count == batch["target"].as_u64().unwrap_or(0) {
                    self.event("device.finish", parsed.clone())?;
                    self.result("machine", "")?;
                } else {
                    let s = self.state.as_mut().unwrap();
                    s.phase = "review".into();
                    s.error = Some("收到完成反馈，但计数与目标不一致，请核对".into());
                    self.save()?;
                }
            }
            if (parsed["type"] == "fault" || parsed["type"] == "reset")
                && (active || resolving || interrupted)
            {
                let s = self.state.as_mut().unwrap();
                s.phase = "review".into();
                s.pending_resolution = None;
                s.error = Some(
                    parsed["reason"]
                        .as_str()
                        .unwrap_or("机器重新初始化，请核对")
                        .into(),
                );
                self.save()?;
            }
        }
        if self.input_buffer.len() > 8192 {
            self.input_buffer.clear();
        }
        Ok(())
    }
    fn tick(&mut self) -> Result<(), String> {
        if self.mode == "serial" {
            return self.receive();
        }
        let Some(s) = self.state.as_ref() else {
            return Ok(());
        };
        if s.phase != "running" || !s.connected {
            return Ok(());
        }
        self.ticks += 1;
        if self.ticks < 2 {
            return Ok(());
        }
        self.ticks = 0;
        let batch = self.batch()?;
        let target = batch["target"].as_u64().ok_or("目标量无效")?;
        let s = self.state.as_mut().unwrap();
        if s.count < target {
            s.count += 1;
            let count = s.count;
            self.event(
                "device.progress",
                json!({"count":count,"width":8,"source":"simulator"}),
            )?;
        } else {
            self.event("device.finish", json!({"source":"simulator"}))?;
            self.result("machine", "")?;
        }
        Ok(())
    }
    fn command(&mut self, method: &str, input: Value) -> Result<Value, String> {
        if self.state.as_ref().is_some_and(|s| s.phase == "discarding")
            && ![
                "status",
                "configure",
                "ports",
                "prepareDiscard",
                "finishDiscard",
                "prepareExit",
                "network",
            ]
            .contains(&method)
        {
            return Err("请先完成本次任务删除".into());
        }
        match method {
            "status" => {
                self.save()?;
                Ok(
                    json!({"state":self.state,"online":self.online,"mode":self.mode,"port":self.port,"lastUid":self.last_uid,"hardwareVerified":false}),
                )
            }
            "configure" => {
                let config: Configuration =
                    serde_json::from_value(input).map_err(|e| e.to_string())?;
                if self
                    .config
                    .as_ref()
                    .is_some_and(|c| c.institution_id != config.institution_id)
                    && !self.pending()?.is_empty()
                {
                    return Err("原机构仍有待同步记录，请联网同步后切换".into());
                }
                if let Some(s) = &self.state {
                    if s.phase != "ended"
                        && (config.institution_id != s.plan["institutionId"].as_str().unwrap_or("")
                            || config.device_id != s.device_id
                            || config.terminal_id != s.terminal_id)
                    {
                        return Err("本机有未结束任务，不能改绑机构或机器".into());
                    }
                }
                self.db.execute("INSERT INTO configuration(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",[serde_json::to_string(&config).unwrap()]).map_err(|e|e.to_string())?;
                self.config = Some(config);
                // A saved binding can resolve the RFID that is currently on the rail.
                if let Some(uid) = self.last_uid.clone() {
                    let raw = self
                        .state
                        .as_ref()
                        .and_then(|s| s.identification_sources.get("rfid"))
                        .and_then(|value| value["raw"].as_str())
                        .map(str::to_string);
                    if let Some(raw) = raw {
                        let resident = self
                            .config
                            .as_ref()
                            .and_then(|c| c.rfid_bindings.get(&uid))
                            .cloned();
                        self.observe_box("rfid", resident, &raw, false)?;
                    }
                }
                Ok(json!({"ok":true}))
            }
            "load" => {
                if let Some(s) = &self.state {
                    if s.phase != "ended" {
                        return Err("请先结束当前任务".into());
                    }
                }
                let c = self.config.as_ref().ok_or("请先配置本机")?;
                let task = &input["task"];
                if task["executionMode"]
                    .as_str()
                    .is_some_and(|mode| mode != self.mode)
                {
                    return Err("任务模式与当前设备模式不一致".into());
                }
                if task["terminalId"] != c.terminal_id
                    || task["deviceId"] != c.device_id
                    || task["institutionId"] != c.institution_id
                {
                    return Err("任务与本机归属不匹配".into());
                }
                let plan = task["plan"].clone();
                if plan["batches"].as_array().is_none_or(|b| b.is_empty()) {
                    return Err("没有可执行药物".into());
                }
                self.state = Some(Snapshot {
                    task_id: task["id"].as_str().ok_or("任务身份缺失")?.into(),
                    plan,
                    phase: "ready".into(),
                    batch_index: 0,
                    count: 0,
                    results: vec![],
                    identified_resident_id: None,
                    box_prepared: false,
                    identification_issue: None,
                    identification_sources: Default::default(),
                    gate_overrides: Default::default(),
                    gate_value: None,
                    pending_resolution: None,
                    has_started: false,
                    connected: self.mode == "simulator" || self.serial.is_some(),
                    mode: self.mode.clone(),
                    sequence: 0,
                    pending_sync: 0,
                    error: None,
                    device_id: c.device_id.clone(),
                    terminal_id: c.terminal_id.clone(),
                    last_updated: timestamp(),
                });
                self.save()?;
                Ok(json!({"ok":true}))
            }
            "prepareBox" => {
                let s = self.state.as_ref().ok_or("没有当前任务")?;
                if !["ready", "tray_change"].contains(&s.phase.as_str()) {
                    return Err("当前阶段无需准备药盒".into());
                }
                if !s.connected {
                    return Err("请先连接摆药机，再开仓放入药盒".into());
                }
                if s.box_prepared {
                    return Ok(json!({"ok":true}));
                }
                self.send(protocol::frame(3, &[]))?;
                self.state.as_mut().unwrap().box_prepared = true;
                self.event("box.open_requested", json!({"source":self.mode}))?;
                Ok(json!({"ok":true}))
            }
            "identify" | "identifyAbsent" => {
                let s = self.state.as_ref().ok_or("没有当前任务")?;
                if input["taskId"].as_str().is_some_and(|id| id != s.task_id) {
                    return Err("识别结果不属于当前任务".into());
                }
                if !["ready", "tray_change"].contains(&s.phase.as_str()) {
                    return Err("仅放盒或换盘阶段可以识别".into());
                }
                if !s.box_prepared {
                    return Err("请先开仓，再放入药盒".into());
                }
                let source = input["source"]
                    .as_str()
                    .unwrap_or(if self.mode == "simulator" {
                        "simulator"
                    } else {
                        "barcode"
                    });
                if source == "simulator" && self.mode != "simulator" {
                    return Err("真实机器不能使用模拟识别".into());
                }
                let resident = input["residentId"].as_str().map(str::to_string);
                self.observe_box(
                    source,
                    resident,
                    input["raw"].as_str().unwrap_or(""),
                    method == "identifyAbsent",
                )?;
                Ok(json!({"ok":true}))
            }
            "setGate" => {
                let value = input["value"]
                    .as_f64()
                    .filter(|value| value.is_finite() && (0.0..=1.0).contains(value))
                    .ok_or("阀门舵机刻度须为 0–1 的数值")?;
                let s = self.state.as_ref().ok_or("请先领取本次任务")?;
                if input["taskId"] != s.task_id {
                    return Err("当前任务已变化，请重新核对后调整".into());
                }
                if ![
                    "ready",
                    "running",
                    "paused",
                    "next_drug",
                    "tray_change",
                    "review",
                    "interrupted",
                ]
                .contains(&s.phase.as_str())
                {
                    return Err("当前阶段无需调整阀门".into());
                }
                if !s.connected {
                    return Err("设备未连接".into());
                }
                let index = s.batch_index
                    + usize::from(["next_drug", "tray_change"].contains(&s.phase.as_str()));
                let batch = s.plan["batches"]
                    .as_array()
                    .and_then(|b| b.get(index))
                    .ok_or("没有待调整药物")?;
                let batch_id = batch["id"].as_str().ok_or("药物批次身份缺失")?.to_string();
                if input["batchId"] != batch_id {
                    return Err("当前药物已变化，请重新核对后调整".into());
                }
                self.send(protocol::parameter(1, value as f32))?;
                let s = self.state.as_mut().unwrap();
                s.gate_overrides.insert(batch_id.clone(), value);
                s.gate_value = Some(value);
                self.event("device.gate_set", json!({"batchId":batch_id,"value":value,"unit":"device_scale","source":self.mode}))?;
                Ok(json!({"ok":true}))
            }
            "start" => {
                let s = self.state.as_ref().ok_or("没有当前任务")?;
                if s.phase != "ready" && s.phase != "next_drug" {
                    return Err("当前阶段不能启动药物".into());
                }
                if !s.connected {
                    return Err("设备未连接".into());
                }
                if !s.has_started {
                    return Err("尚未取得中央启动许可".into());
                }
                if s.identified_resident_id.is_none() {
                    return Err("请先识别药盒所属住民".into());
                }
                let s = self.state.as_mut().unwrap();
                if s.phase == "next_drug" {
                    s.batch_index += 1;
                }
                s.count = 0;
                s.phase = "running".into();
                let batch = self.batch()?;
                self.event(
                    "batch.start_requested",
                    json!({"batchId":batch["id"],"source":self.mode}),
                )?;
                let gate = self
                    .state
                    .as_ref()
                    .unwrap()
                    .gate_overrides
                    .get(batch["id"].as_str().unwrap_or(""))
                    .copied()
                    .unwrap_or_else(|| batch["parameters"]["gate"].as_f64().unwrap_or(0.7));
                let commands = vec![
                    protocol::parameter(
                        0,
                        batch["parameters"]["motor"].as_f64().unwrap_or(0.2) as f32,
                    ),
                    protocol::parameter(1, gate as f32),
                ];
                for bytes in commands {
                    if let Err(error) = self.send(bytes) {
                        let s = self.state.as_mut().unwrap();
                        s.phase = "interrupted".into();
                        s.error = Some(error.clone());
                        self.save()?;
                        return Err(error);
                    }
                }
                self.state.as_mut().unwrap().gate_value = Some(gate);
                if self.mode == "serial" {
                    let bytes = protocol::matrix(&batch["matrix"])?;
                    if let Err(error) = self.send(bytes) {
                        let s = self.state.as_mut().unwrap();
                        s.phase = "interrupted".into();
                        s.error = Some(error.clone());
                        self.save()?;
                        return Err(error);
                    }
                }
                self.event(
                    "batch.started",
                    json!({"batchId":batch["id"],"source":self.mode,"gate":gate,"parameterVersion":batch["parameters"]["version"]}),
                )?;
                Ok(json!({"ok":true}))
            }
            "authorize" => {
                if !self.online {
                    return Err("网络离线，新任务等待恢复".into());
                }
                let s = self.state.as_ref().ok_or("没有任务")?;
                if s.has_started {
                    return Ok(json!({"ok":true}));
                }
                if s.phase != "ready" || s.identified_resident_id.is_none() || !s.connected {
                    return Err("请先连接设备并识别药盒".into());
                }
                #[cfg(not(test))]
                {
                    let c = self.config.as_ref().ok_or("本机未配置")?;
                    let response = Client::builder()
                        .timeout(Duration::from_secs(5))
                        .build()
                        .map_err(|e| e.to_string())?
                        .post(format!(
                            "{}/api/tasks/{}/begin",
                            c.api_url.trim_end_matches('/'),
                            s.task_id
                        ))
                        .bearer_auth(&c.token)
                        .header("x-institution-id", &c.institution_id)
                        .json(&json!({"terminalId":c.terminal_id}))
                        .send()
                        .map_err(|_| "无法连接中央服务，新任务等待恢复网络")?;
                    if !response.status().is_success() {
                        let value: Value = response.json().unwrap_or(json!({}));
                        return Err(value["message"].as_str().unwrap_or("未取得启动许可").into());
                    }
                }
                let s = self.state.as_mut().unwrap();
                s.has_started = true;
                self.event("task.started", json!({"source":self.mode}))?;
                Ok(json!({"ok":true}))
            }
            "prepareExit" => {
                if self.state.as_ref().is_some_and(|s| s.phase == "running") {
                    self.command("pause", json!({}))?;
                    self.event("task.exit_requested", json!({"source":"window_close"}))?;
                }
                self.save()?;
                Ok(json!({"ok":true}))
            }
            "pause" => {
                let s = self.state.as_mut().ok_or("没有任务")?;
                if s.phase != "running" {
                    return Err("当前没有正在摆放的药物".into());
                }
                self.send(protocol::parameter(0, 0.0))?;
                let s = self.state.as_mut().unwrap();
                s.phase = "paused".into();
                self.event("task.paused", json!({}))?;
                Ok(json!({"ok":true}))
            }
            "resume" | "continueInterrupted" => {
                if method == "continueInterrupted" {
                    self.receive()?;
                }
                let s = self.state.as_mut().ok_or("没有任务")?;
                if method == "continueInterrupted" {
                    if s.phase != "interrupted" || !s.has_started {
                        return Err("当前没有可继续的中断批次".into());
                    }
                    if input["taskId"] != s.task_id
                        || input["batchId"] != s.plan["batches"][s.batch_index]["id"]
                    {
                        return Err("当前任务或药物已变化，请重新核对".into());
                    }
                    if input["progressRetained"] != true {
                        return Err("请确认机器未复位、原药盒未更换且当前批次进度仍保留".into());
                    }
                    let batch_id = s.plan["batches"][s.batch_index]["id"]
                        .as_str()
                        .ok_or("药物批次身份缺失")?;
                    if s.results.iter().any(|result| result["batchId"] == batch_id) {
                        return Err("当前药物已有处理结果，不能重复恢复，请核对现场".into());
                    }
                    let started: bool = self.db.query_row(
                        "SELECT EXISTS(SELECT 1 FROM outbox WHERE task_id=? AND json_extract(body,'$.type')='batch.started' AND json_extract(body,'$.data.batchId')=?)",
                        params![s.task_id, batch_id], |row| row.get(0),
                    ).map_err(|e|e.to_string())?;
                    if !started {
                        return Err("当前批次的启动下发未确认，请人工核对或结束此次分药".into());
                    }
                } else if s.phase != "paused" {
                    return Err("当前药物没有暂停".into());
                }
                if !s.connected || (self.mode == "serial" && self.serial.is_none()) {
                    return Err("请先重新连接摆药机".into());
                }
                self.send(protocol::parameter(0, 8.0))?;
                let s = self.state.as_mut().unwrap();
                s.phase = "running".into();
                s.error = None;
                self.event("task.resumed", json!({"afterInterruption":method == "continueInterrupted","progressRetained":input["progressRetained"]}))?;
                Ok(json!({"ok":true}))
            }
            "tray" => {
                let s = self.state.as_mut().ok_or("没有任务")?;
                if s.phase != "tray_change" {
                    return Err("当前无需换盘".into());
                }
                if s.identified_resident_id.is_none() {
                    return Err("请放入并识别下一盘药盒".into());
                }
                s.phase = "next_drug".into();
                self.event("tray.changed", json!({"confirmedBy":"operator"}))?;
                self.command("start", json!({}))
            }
            "prepareDiscard" => {
                let s = self.state.as_mut().ok_or("没有当前任务")?;
                if input["taskId"] != s.task_id || input["confirmed"] != true {
                    return Err("请核对当前任务并确认结束、删除本次分药".into());
                }
                if !["interrupted", "review", "discarding"].contains(&s.phase.as_str())
                    && !(s.has_started
                        && !s.connected
                        && ["next_drug", "tray_change", "take_out"].contains(&s.phase.as_str()))
                {
                    return Err("请先停止投料并处理设备中断".into());
                }
                // Freeze locally before deleting centrally. A restart retains this intent.
                s.phase = "discarding".into();
                s.connected = false;
                s.pending_resolution = None;
                s.error = None;
                self.serial = None;
                self.input_buffer.clear();
                self.save()?;
                Ok(json!({"ok":true}))
            }
            "finishDiscard" => {
                let s = self.state.as_ref().ok_or("没有当前任务")?;
                if s.phase != "discarding"
                    || input["taskId"] != s.task_id
                    || input["confirmed"] != true
                {
                    return Err("请先确认结束当前分药".into());
                }
                let task_id = s.task_id.clone();
                let tx = self.db.transaction().map_err(|e| e.to_string())?;
                // Old diagnostics had no task identity; only remove rows in this
                // still-current task's event interval, retaining prior tasks.
                tx.execute("DELETE FROM diagnostics WHERE task_id=? OR (task_id IS NULL AND received_at >= (SELECT MIN(json_extract(body,'$.receivedAt')) FROM outbox WHERE task_id=?))", params![task_id, task_id]).map_err(|e|e.to_string())?;
                tx.execute("DELETE FROM outbox WHERE task_id=?", [&task_id])
                    .map_err(|e| e.to_string())?;
                tx.execute("DELETE FROM state WHERE id=1", [])
                    .map_err(|e| e.to_string())?;
                tx.commit().map_err(|e| e.to_string())?;
                self.state = None;
                self.last_uid = None;
                self.port.clear();
                Ok(json!({"ok":true}))
            }
            "manual" | "skip" | "unknown" => {
                let s = self.state.as_ref().ok_or("没有任务")?;
                if !["running", "paused", "review", "interrupted"].contains(&s.phase.as_str()) {
                    return Err("此阶段没有待核对批次".into());
                }
                let reason = input["reason"]
                    .as_str()
                    .filter(|v| !v.trim().is_empty())
                    .ok_or("请填写处理原因")?;
                let status = match method {
                    "manual" => "manual",
                    "skip" => "skipped",
                    _ => "unknown",
                };
                if self.mode == "serial" {
                    let batch_id = self.batch()?["id"]
                        .as_str()
                        .ok_or("药物批次身份缺失")?
                        .to_string();
                    let s = self.state.as_mut().unwrap();
                    s.pending_resolution = Some(PendingResolution {
                        batch_id: batch_id.clone(),
                        status: status.into(),
                        reason: reason.into(),
                        step: ResolutionStep::WaitingStopAck,
                    });
                    s.phase = "resolving".into();
                    self.event(
                        "batch.resolution_requested",
                        json!({"batchId":batch_id,"status":status,"reason":reason}),
                    )?;
                    if let Err(error) = self.send(protocol::parameter(0, 0.0)) {
                        let s = self.state.as_mut().unwrap();
                        s.phase = "interrupted".into();
                        s.pending_resolution = None;
                        s.error = Some(format!("停转请求失败：{error}，请核对现场后重试处理。"));
                        self.save()?;
                        return Err(error);
                    }
                } else {
                    self.result(status, reason)?;
                }
                Ok(json!({"ok":true}))
            }
            "takeOut" => {
                let s = self.state.as_ref().ok_or("没有任务")?;
                if s.phase != "take_out" {
                    return Err("请先完成药物处理".into());
                }
                // Keep take_out on write failure so the operator can retry.
                self.send(protocol::frame(4, &[]))?;
                self.event("box.close_requested", json!({"source":"operator"}))?;
                let s = self.state.as_mut().unwrap();
                s.phase = "ended".into();
                self.event(
                    "task.ended",
                    json!({"takeOutSource":"operator","closeRequested":true}),
                )?;
                Ok(json!({"ok":true}))
            }
            "openForRemoval" => {
                let s = self.state.as_ref().ok_or("没有任务")?;
                if s.phase != "take_out" {
                    return Err("当前不是取盒阶段".into());
                }
                self.send(protocol::frame(3, &[]))?;
                self.state.as_mut().unwrap().error = None;
                self.event(
                    "box.open_requested",
                    json!({"source":self.mode,"reason":"operator_retry"}),
                )?;
                Ok(json!({"ok":true}))
            }
            "reviewResolution" => {
                let s = self.state.as_mut().ok_or("没有任务")?;
                if s.phase != "resolving" {
                    return Err("当前没有等待退出的处理请求".into());
                }
                s.pending_resolution = None;
                s.phase = "interrupted".into();
                s.error =
                    Some("退出反馈尚未确认，请停止投料并核对现场，再重新处理当前药物。".into());
                self.event(
                    "batch.resolution_review_requested",
                    json!({"source":"operator"}),
                )?;
                Ok(json!({"ok":true}))
            }
            "disconnect" => {
                let s = self.state.as_mut().ok_or("没有任务")?;
                s.connected = false;
                s.pending_resolution = None;
                if s.has_started
                    && ["running", "paused", "review", "resolving", "interrupted"]
                        .contains(&s.phase.as_str())
                {
                    s.phase = "interrupted".into();
                    s.error = Some("设备连接中断，请核对现场".into())
                }
                self.event("device.disconnected", json!({}))?;
                Ok(json!({"ok":true}))
            }
            "reconnect" => {
                if self.mode == "serial" {
                    return Err("真实机器请使用串口连接，不能直接标记为已连接".into());
                }
                let s = self.state.as_mut().ok_or("没有任务")?;
                s.connected = true;
                self.save()?;
                Ok(json!({"ok":true}))
            }
            "network" => {
                self.online = input["online"].as_bool().ok_or("网络状态无效")?;
                Ok(json!({"online":self.online}))
            }
            "ports" => Ok(
                json!({"ports":serialport::available_ports().map_err(|e|e.to_string())?.into_iter().map(|p|json!({"name":p.port_name,"kind":format!("{:?}",p.port_type)})).collect::<Vec<_>>()}),
            ),
            "updateAllowed" => {
                if self.state.as_ref().is_some_and(|s| s.phase != "ended") {
                    return Err("请先结束当前任务再更新软件".into());
                }
                if !self.pending()?.is_empty() {
                    return Err("请先同步本机记录再更新软件".into());
                }
                Ok(json!({"ok":true}))
            }
            "mode" => {
                if self.state.as_ref().is_some_and(|s| s.phase != "ended") {
                    return Err("请先结束当前任务再切换机器模式".into());
                }
                let mode = input["mode"].as_str().unwrap_or("");
                if !["simulator", "serial"].contains(&mode) {
                    return Err("机器模式无效".into());
                }
                self.serial = None;
                self.mode = mode.into();
                self.port = String::new();
                if let Some(s) = self.state.as_mut() {
                    s.mode = mode.into();
                    s.connected = mode == "simulator";
                }
                self.save()?;
                Ok(json!({"ok":true}))
            }
            "connect" => {
                let name = input["port"].as_str().ok_or("请选择串口")?;
                if self.state.as_ref().is_some_and(|s| s.phase == "discarding") {
                    return Err("请先完成本次任务删除".into());
                }
                // Drop a stale handle before reopening the same COM port.
                self.serial = None;
                if let Some(s) = self.state.as_mut() {
                    s.connected = false;
                    if ["running", "paused", "resolving"].contains(&s.phase.as_str()) {
                        s.phase = "interrupted".into();
                        s.pending_resolution = None;
                        s.error =
                            Some("连接已重新打开，请核对原批次进度后选择继续或结束此次分药".into());
                    }
                }
                self.save()?;
                if self
                    .state
                    .as_ref()
                    .is_some_and(|s| s.phase != "ended" && s.mode != "serial")
                {
                    return Err("请结束模拟任务再连接真机".into());
                }
                let port = serialport::new(name, 115200)
                    .data_bits(serialport::DataBits::Eight)
                    .parity(serialport::Parity::None)
                    .stop_bits(serialport::StopBits::One)
                    .timeout(Duration::from_millis(1))
                    .open()
                    .map_err(|e| format!("串口连接失败：{e}"))?;
                self.serial = Some(port);
                self.mode = "serial".into();
                self.port = name.into();
                self.input_buffer.clear();
                if let Some(s) = self.state.as_mut() {
                    s.mode = "serial".into();
                    s.connected = true;
                    if ["ready", "tray_change"].contains(&s.phase.as_str()) {
                        s.box_prepared = false;
                        s.identified_resident_id = None;
                        s.identification_sources.clear();
                        s.identification_issue = None;
                    }
                }
                self.save()?;
                Ok(json!({"ok":true}))
            }
            "open" => {
                self.send(protocol::frame(3, &[]))?;
                Ok(json!({"ok":true}))
            }
            "clear" => {
                if self
                    .state
                    .as_ref()
                    .is_some_and(|s| s.has_started && s.phase != "ended")
                {
                    return Err("已开始任务不能清除".into());
                }
                self.state = None;
                self.db
                    .execute("DELETE FROM state WHERE id=1", [])
                    .map_err(|e| e.to_string())?;
                Ok(json!({"ok":true}))
            }
            _ => Err(format!("未知本机操作：{method}")),
        }
    }
    fn pending(&self) -> Result<Vec<Value>, String> {
        let mut query = self
            .db
            .prepare("SELECT body FROM outbox WHERE synced=0 ORDER BY rowid LIMIT 300")
            .map_err(|e| e.to_string())?;
        let rows = query
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.map(|r| {
            r.map_err(|e| e.to_string())
                .and_then(|v| serde_json::from_str(&v).map_err(|e| e.to_string()))
        })
        .collect()
    }
}
fn sync_loop(runtime: Arc<Mutex<Runtime>>) {
    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap();
    loop {
        thread::sleep(Duration::from_secs(1));
        let (config, events, online) = {
            let r = runtime.lock().unwrap();
            (r.config.clone(), r.pending().unwrap_or_default(), r.online)
        };
        if !online || events.is_empty() {
            continue;
        }
        let Some(c) = config else { continue };
        let task = events[0]["taskId"].as_str().unwrap_or("").to_string();
        let events: Vec<Value> = events
            .into_iter()
            .filter(|event| event["taskId"] == task)
            .collect();
        let response = client
            .post(format!(
                "{}/api/tasks/{}/sync",
                c.api_url.trim_end_matches('/'),
                task
            ))
            .bearer_auth(&c.token)
            .header("x-institution-id", &c.institution_id)
            .json(&json!({"terminalId":c.terminal_id,"events":events}))
            .send();
        if let Ok(response) = response {
            if response.status().is_success() {
                if let Ok(value) = response.json::<Value>() {
                    if let Some(ids) = value["accepted"].as_array() {
                        let mut r = runtime.lock().unwrap();
                        if let Ok(tx) = r.db.transaction() {
                            for id in ids {
                                let _ = tx.execute(
                                    "UPDATE outbox SET synced=1 WHERE id=?",
                                    [id.as_str().unwrap_or("")],
                                );
                            }
                            let _ = tx.commit();
                        }
                        let _ = r.save();
                    }
                }
            }
        }
    }
}
fn main() {
    let path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".var/runtime.sqlite"));
    let runtime = Arc::new(Mutex::new(Runtime::open(path).unwrap_or_else(|e| {
        eprintln!("{e}");
        std::process::exit(1)
    })));
    let ticking = runtime.clone();
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_millis(150));
            if let Err(e) = ticking.lock().unwrap().tick() {
                eprintln!("runtime: {e}");
            }
        }
    });
    let syncing = runtime.clone();
    thread::spawn(move || sync_loop(syncing));
    for line in io::stdin().lock().lines() {
        let response = match line {
            Ok(line) => match serde_json::from_str::<Value>(&line) {
                Ok(request) => {
                    let result = runtime.lock().unwrap().command(
                        request["method"].as_str().unwrap_or(""),
                        request["params"].clone(),
                    );
                    match result {
                        Ok(result) => json!({"id":request["id"],"result":result}),
                        Err(error) => json!({"id":request["id"],"error":error}),
                    }
                }
                Err(error) => json!({"error":error.to_string()}),
            },
            Err(error) => json!({"error":error.to_string()}),
        };
        println!("{response}");
        let _ = io::stdout().flush();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Runtime {
        let mut r = Runtime::open(PathBuf::from(":memory:")).unwrap();
        r.command("configure",json!({"apiUrl":"http://127.0.0.1:4310","token":"test","institutionId":"a","terminalId":"pc","deviceId":"dev"})).unwrap();
        r.command("load",json!({"task":{"id":"task","institutionId":"a","terminalId":"pc","deviceId":"dev","plan":{"institutionId":"a","residentId":"r","batches":[{"id":"b1","target":3,"tray":0},{"id":"b2","target":2,"tray":1}]}}})).unwrap();
        r
    }
    #[test]
    fn interrupted_continue_requires_connection_and_confirmation_without_replaying_matrix() {
        let mut r = fixture();
        r.mode = "serial".into();
        let s = r.state.as_mut().unwrap();
        s.phase = "interrupted".into();
        s.has_started = true;
        s.connected = false;
        s.count = 2;
        let input = json!({"taskId":"task","batchId":"b1","progressRetained":true});
        assert!(r.command("continueInterrupted", input.clone()).is_err());
        assert!(r.command("reconnect", json!({})).is_err());
        let port = test_port::TestPort::default();
        let bytes = port.bytes.clone();
        r.serial = Some(Box::new(port));
        r.state.as_mut().unwrap().connected = true;
        assert!(r.command("continueInterrupted", input.clone()).is_err());
        r.event("batch.started", json!({"batchId":"b1"})).unwrap();
        assert!(
            r.command(
                "continueInterrupted",
                json!({"taskId":"task","batchId":"b1"})
            )
            .is_err()
        );
        assert!(
            r.command(
                "continueInterrupted",
                json!({"taskId":"old","batchId":"b1","progressRetained":true})
            )
            .is_err()
        );
        assert!(bytes.lock().unwrap().is_empty());
        r.command("continueInterrupted", input).unwrap();
        assert_eq!(*bytes.lock().unwrap(), protocol::parameter(0, 8.0));
        assert_eq!(r.state.as_ref().unwrap().count, 2);
        assert_eq!(r.state.as_ref().unwrap().phase, "running");
        assert!(r.state.as_ref().unwrap().results.is_empty());
    }
    #[test]
    fn failed_continue_drops_stale_transport_and_preserves_progress() {
        let mut r = fixture();
        r.event("batch.started", json!({"batchId":"b1"})).unwrap();
        r.mode = "serial".into();
        r.serial = Some(Box::new(test_port::TestPort {
            fail_write: true,
            ..Default::default()
        }));
        let s = r.state.as_mut().unwrap();
        s.phase = "interrupted".into();
        s.has_started = true;
        s.connected = true;
        s.count = 2;
        assert!(
            r.command(
                "continueInterrupted",
                json!({"taskId":"task","batchId":"b1","progressRetained":true})
            )
            .is_err()
        );
        assert!(!r.state.as_ref().unwrap().connected);
        assert!(r.serial.is_none());
        assert_eq!(r.state.as_ref().unwrap().count, 2);
        assert_eq!(r.state.as_ref().unwrap().phase, "interrupted");
    }
    #[test]
    fn completed_or_reset_batch_cannot_be_resumed_from_interruption() {
        let mut r = fixture();
        r.mode = "serial".into();
        let port = test_port::TestPort::default();
        let bytes = port.bytes.clone();
        r.serial = Some(Box::new(port));
        let s = r.state.as_mut().unwrap();
        s.phase = "interrupted".into();
        s.has_started = true;
        s.connected = true;
        s.results
            .push(json!({"batchId":"b1","status":"machine","count":3}));
        r.event("batch.started", json!({"batchId":"b1"})).unwrap();
        let input = json!({"taskId":"task","batchId":"b1","progressRetained":true});
        assert!(r.command("continueInterrupted", input.clone()).is_err());
        r.state.as_mut().unwrap().results.clear();
        r.input_buffer.extend_from_slice(b"machine init\n");
        assert!(r.command("continueInterrupted", input).is_err());
        assert_eq!(r.state.as_ref().unwrap().phase, "review");
        assert!(bytes.lock().unwrap().is_empty());
    }
    #[test]
    fn discard_freezes_task_then_deletes_its_data_without_hardware_commands() {
        let mut r = fixture();
        let port = test_port::TestPort::default();
        let bytes = port.bytes.clone();
        r.serial = Some(Box::new(port));
        r.mode = "serial".into();
        let s = r.state.as_mut().unwrap();
        s.phase = "interrupted".into();
        s.has_started = true;
        s.count = 2;
        r.event("device.progress", json!({"count":2})).unwrap();
        r.db.execute(
            "INSERT INTO diagnostics(received_at,raw,task_id) VALUES(?,?,?)",
            params![timestamp(), "count:2", "task"],
        )
        .unwrap();
        r.db.execute(
            "INSERT INTO diagnostics(received_at,raw,task_id) VALUES(?,?,?)",
            params![timestamp(), "older", "other"],
        )
        .unwrap();
        r.db.execute(
            "INSERT INTO diagnostics(received_at,raw) VALUES(?,?)",
            params![timestamp(), "legacy-current"],
        )
        .unwrap();
        r.db.execute(
            "INSERT INTO diagnostics(received_at,raw) VALUES(?,?)",
            params!["2000-01-01T00:00:00Z", "legacy-older"],
        )
        .unwrap();
        assert!(
            r.command("prepareDiscard", json!({"taskId":"task"}))
                .is_err()
        );
        assert!(
            r.command("finishDiscard", json!({"taskId":"task","confirmed":true}))
                .is_err()
        );
        let input = json!({"taskId":"task","confirmed":true});
        r.command("prepareDiscard", input.clone()).unwrap();
        assert_eq!(r.state.as_ref().unwrap().phase, "discarding");
        assert!(r.command("start", json!({})).is_err());
        assert!(r.command("disconnect", json!({})).is_err());
        r.command("prepareExit", json!({})).unwrap();
        assert_eq!(r.state.as_ref().unwrap().phase, "discarding");
        r.command("prepareDiscard", input.clone()).unwrap();
        r.command("finishDiscard", input).unwrap();
        assert!(r.state.is_none());
        assert!(r.pending().unwrap().is_empty());
        assert!(bytes.lock().unwrap().is_empty());
        assert_eq!(
            r.db.query_row("SELECT count(*) FROM state", [], |row| row.get::<_, u64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            r.db.query_row("SELECT count(*) FROM diagnostics", [], |row| row
                .get::<_, u64>(0))
                .unwrap(),
            2
        );
    }
    #[test]
    fn discard_intent_survives_restart_and_retains_other_task_events() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../.var")
            .join(format!("discard-test-{}.sqlite", Uuid::new_v4()));
        {
            let r = fixture();
            let mut disk = Runtime::open(path.clone()).unwrap();
            disk.state = r.state;
            disk.state.as_mut().unwrap().phase = "interrupted".into();
            disk.event("device.progress", json!({"count":1})).unwrap();
            disk.db
                .execute(
                    "INSERT INTO outbox(id,task_id,body) VALUES('other','other','{}')",
                    [],
                )
                .unwrap();
            disk.command("prepareDiscard", json!({"taskId":"task","confirmed":true}))
                .unwrap();
        }
        {
            let mut reopened = Runtime::open(path.clone()).unwrap();
            assert_eq!(reopened.state.as_ref().unwrap().phase, "discarding");
            assert!(reopened.command("resume", json!({})).is_err());
            reopened
                .command("finishDiscard", json!({"taskId":"task","confirmed":true}))
                .unwrap();
            assert_eq!(
                reopened
                    .db
                    .query_row(
                        "SELECT count(*) FROM outbox WHERE task_id='other'",
                        [],
                        |row| row.get::<_, u64>(0)
                    )
                    .unwrap(),
                1
            );
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn completed_tray_opens_then_operator_takeout_sends_retraction_before_ending() {
        let mut r = fixture();
        let port = test_port::TestPort::default();
        let bytes = port.bytes.clone();
        r.mode = "serial".into();
        r.serial = Some(Box::new(port));
        let s = r.state.as_mut().unwrap();
        s.plan["batches"].as_array_mut().unwrap().truncate(1);
        s.count = 3;
        s.phase = "running".into();
        r.result("machine", "").unwrap();
        assert_eq!(r.state.as_ref().unwrap().phase, "take_out");
        assert_eq!(*bytes.lock().unwrap(), vec![0xaa, 0xbb, 3, 3, 0]);
        let original_results = r.state.as_ref().unwrap().results.clone();
        r.command("takeOut", json!({})).unwrap();
        assert_eq!(
            *bytes.lock().unwrap(),
            vec![0xaa, 0xbb, 3, 3, 0, 0xaa, 0xbb, 4, 4, 0]
        );
        assert_eq!(r.state.as_ref().unwrap().phase, "ended");
        assert_eq!(r.state.as_ref().unwrap().results, original_results);
        assert_eq!(r.state.as_ref().unwrap().count, 3);
        let events = r.pending().unwrap();
        let closed = events
            .iter()
            .position(|e| e["type"] == "box.close_requested")
            .unwrap();
        let ended = events
            .iter()
            .position(|e| e["type"] == "task.ended")
            .unwrap();
        assert!(closed < ended);
        assert!(r.command("takeOut", json!({})).is_err());
        assert_eq!(bytes.lock().unwrap().len(), 10);
    }
    #[test]
    fn failed_retraction_keeps_takeout_and_results_available_for_retry() {
        for fail_flush in [false, true] {
            let mut r = fixture();
            r.mode = "serial".into();
            r.serial = Some(Box::new(test_port::TestPort {
                fail_write: !fail_flush,
                fail_flush,
                ..Default::default()
            }));
            let s = r.state.as_mut().unwrap();
            s.phase = "take_out".into();
            s.count = 3;
            s.results = vec![json!({"batchId":"b1","status":"machine","count":3})];
            let original_results = s.results.clone();
            assert!(r.command("takeOut", json!({})).is_err());
            assert_eq!(r.state.as_ref().unwrap().phase, "take_out");
            assert_eq!(r.state.as_ref().unwrap().results, original_results);
            assert!(
                !r.pending()
                    .unwrap()
                    .iter()
                    .any(|e| e["type"] == "task.ended")
            );
            r.serial = Some(Box::new(test_port::TestPort::default()));
            r.command("takeOut", json!({})).unwrap();
            assert_eq!(r.state.as_ref().unwrap().phase, "ended");
        }
    }
    #[test]
    fn premature_takeout_never_moves_the_track() {
        let mut r = fixture();
        let port = test_port::TestPort::default();
        let bytes = port.bytes.clone();
        r.mode = "serial".into();
        r.serial = Some(Box::new(port));
        for phase in ["ready", "running", "paused", "tray_change", "ended"] {
            r.state.as_mut().unwrap().phase = phase.into();
            assert!(r.command("takeOut", json!({})).is_err());
        }
        assert!(bytes.lock().unwrap().is_empty());
    }
    #[test]
    fn last_batch_resolution_opens_tray_and_retry_never_rewrites_results() {
        for method in ["skip", "manual", "unknown"] {
            let mut r = fixture();
            let port = test_port::TestPort::default();
            let bytes = port.bytes.clone();
            r.mode = "serial".into();
            r.serial = Some(Box::new(port));
            let s = r.state.as_mut().unwrap();
            s.batch_index = 1;
            s.phase = "paused".into();
            s.count = 1;
            s.results = vec![json!({"batchId":"b1","status":"machine","count":3})];
            r.command(method, json!({"reason":"现场测试"})).unwrap();
            assert_eq!(r.state.as_ref().unwrap().phase, "resolving");
            assert_eq!(r.state.as_ref().unwrap().results.len(), 1);
            assert_eq!(*bytes.lock().unwrap(), protocol::parameter(0, 0.0));
            r.advance_resolution("done").unwrap();
            r.advance_resolution("finish").unwrap();
            assert_eq!(bytes.lock().unwrap().len(), 10);
            r.advance_resolution("ack").unwrap();
            assert_eq!(&bytes.lock().unwrap()[10..], &[0xaa, 0xbb, 0, 0, 0]);
            r.advance_resolution("done").unwrap();
            assert_eq!(bytes.lock().unwrap().len(), 15);
            r.advance_resolution("ack").unwrap();
            assert_eq!(bytes.lock().unwrap().len(), 15);
            r.advance_resolution("done").unwrap();
            assert_eq!(r.state.as_ref().unwrap().phase, "take_out");
            assert_eq!(r.state.as_ref().unwrap().results.len(), 2);
            assert_eq!(
                r.state.as_ref().unwrap().results[1]["status"],
                if method == "skip" { "skipped" } else { method }
            );
            assert_eq!(&bytes.lock().unwrap()[15..], &[0xaa, 0xbb, 3, 3, 0]);
            let original_results = r.state.as_ref().unwrap().results.clone();
            r.advance_resolution("done").unwrap();
            assert_eq!(r.state.as_ref().unwrap().results, original_results);
            r.command("openForRemoval", json!({})).unwrap();
            assert_eq!(r.state.as_ref().unwrap().results, original_results);
            assert_eq!(r.state.as_ref().unwrap().phase, "take_out");
            assert_eq!(r.state.as_ref().unwrap().count, 1);
            assert_eq!(&bytes.lock().unwrap()[20..], &[0xaa, 0xbb, 3, 3, 0]);
        }
    }
    #[test]
    fn resolution_interruption_never_opens_or_records_a_completed_batch() {
        for interruption in ["reviewResolution", "fault", "reset", "disconnect"] {
            let mut r = fixture();
            let port = test_port::TestPort::default();
            let bytes = port.bytes.clone();
            r.mode = "serial".into();
            r.serial = Some(Box::new(port));
            let s = r.state.as_mut().unwrap();
            s.phase = "running".into();
            s.has_started = true;
            r.command("skip", json!({"reason":"现场跳过"})).unwrap();
            r.advance_resolution("ack").unwrap();
            if interruption == "fault" || interruption == "reset" {
                r.input_buffer
                    .extend_from_slice(if interruption == "fault" {
                        b"machine_state:CNT_ERR\n"
                    } else {
                        b"machine init\n"
                    });
                r.receive().unwrap();
            } else {
                r.command(interruption, json!({})).unwrap();
            }
            assert!(r.state.as_ref().unwrap().pending_resolution.is_none());
            r.advance_resolution("ack").unwrap();
            r.advance_resolution("done").unwrap();
            assert!(r.state.as_ref().unwrap().results.is_empty());
            assert_eq!(bytes.lock().unwrap().len(), 15);
            assert_ne!(r.state.as_ref().unwrap().phase, "take_out");
        }
    }
    #[test]
    fn exit_write_failure_keeps_partial_progress_and_allows_review() {
        let mut r = fixture();
        r.mode = "serial".into();
        r.serial = Some(Box::new(test_port::TestPort::default()));
        let s = r.state.as_mut().unwrap();
        s.phase = "running".into();
        s.count = 1;
        r.command("skip", json!({"reason":"现场跳过"})).unwrap();
        r.serial = Some(Box::new(test_port::TestPort {
            fail_write: true,
            ..Default::default()
        }));
        assert!(r.advance_resolution("ack").is_err());
        let s = r.state.as_ref().unwrap();
        assert_eq!(s.phase, "interrupted");
        assert_eq!(s.count, 1);
        assert!(s.results.is_empty());
        assert!(s.pending_resolution.is_none());
    }
    #[test]
    fn failed_opening_preserves_last_result_and_exposes_retry() {
        let mut r = fixture();
        let s = r.state.as_mut().unwrap();
        s.batch_index = 1;
        s.count = 1;
        r.mode = "serial".into();
        r.serial = Some(Box::new(test_port::TestPort {
            fail_write: true,
            ..Default::default()
        }));
        assert!(r.result("skipped", "现场跳过").is_err());
        assert_eq!(r.state.as_ref().unwrap().phase, "take_out");
        assert_eq!(r.state.as_ref().unwrap().results.len(), 1);
        assert!(
            r.state
                .as_ref()
                .unwrap()
                .error
                .as_ref()
                .unwrap()
                .contains("重新开仓")
        );
        r.serial = Some(Box::new(test_port::TestPort::default()));
        r.command("openForRemoval", json!({})).unwrap();
        assert!(r.state.as_ref().unwrap().error.is_none());
        assert_eq!(r.state.as_ref().unwrap().results.len(), 1);
    }
    #[test]
    fn identification_and_start_permission() {
        let mut r = fixture();
        assert!(
            r.command("identify", json!({"residentId":"wrong"}))
                .is_err()
        );
        r.command("prepareBox", json!({})).unwrap();
        r.command("identify", json!({"residentId":"wrong"}))
            .unwrap();
        assert!(r.state.as_ref().unwrap().identified_resident_id.is_none());
        assert!(r.command("start", json!({})).is_err());
        r.command("identify", json!({"residentId":"r"})).unwrap();
        r.command("authorize", json!({})).unwrap();
        r.command("start", json!({})).unwrap();
        assert_eq!(r.state.as_ref().unwrap().phase, "running");
    }
    #[test]
    fn gate_adjustment_preserves_plan_progress_and_next_drug_independence() {
        let mut r = fixture();
        let plan = r.state.as_ref().unwrap().plan.clone();
        r.command(
            "setGate",
            json!({"taskId":"task","batchId":"b1","value":0.3}),
        )
        .unwrap();
        r.command("prepareBox", json!({})).unwrap();
        r.command("identify", json!({"residentId":"r"})).unwrap();
        r.command("authorize", json!({})).unwrap();
        r.command("start", json!({})).unwrap();
        assert_eq!(r.state.as_ref().unwrap().gate_value, Some(0.3));
        r.tick().unwrap();
        let count = r.state.as_ref().unwrap().count;
        r.command(
            "setGate",
            json!({"taskId":"task","batchId":"b1","value":0.25}),
        )
        .unwrap();
        assert_eq!(r.state.as_ref().unwrap().count, count);
        assert_eq!(r.state.as_ref().unwrap().phase, "running");
        r.command("pause", json!({})).unwrap();
        r.command(
            "setGate",
            json!({"taskId":"task","batchId":"b1","value":0.2}),
        )
        .unwrap();
        assert_eq!(r.state.as_ref().unwrap().phase, "paused");
        assert_eq!(r.state.as_ref().unwrap().plan, plan);
        r.command("resume", json!({})).unwrap();
        while r.state.as_ref().unwrap().phase == "running" {
            r.tick().unwrap();
        }
        r.command("identify", json!({"residentId":"r"})).unwrap();
        r.command("tray", json!({})).unwrap();
        assert_eq!(r.state.as_ref().unwrap().gate_value, Some(0.7));
        assert_eq!(r.state.as_ref().unwrap().batch_index, 1);
        let events = r.pending().unwrap();
        assert_eq!(
            events
                .iter()
                .filter(|e| e["type"] == "device.gate_set")
                .count(),
            3
        );
    }
    #[test]
    fn invalid_or_stale_gate_adjustment_has_no_side_effects() {
        let mut r = fixture();
        let initial = serde_json::to_value(r.state.as_ref().unwrap()).unwrap();
        for value in [json!(-0.1), json!(1.01), json!("0.5"), json!(null)] {
            assert!(
                r.command(
                    "setGate",
                    json!({"taskId":"task","batchId":"b1","value":value})
                )
                .is_err()
            );
        }
        assert!(
            r.command(
                "setGate",
                json!({"taskId":"other","batchId":"b1","value":0.5})
            )
            .is_err()
        );
        assert!(
            r.command(
                "setGate",
                json!({"taskId":"task","batchId":"b2","value":0.5})
            )
            .is_err()
        );
        assert_eq!(
            serde_json::to_value(r.state.as_ref().unwrap()).unwrap(),
            initial
        );
        assert!(r.pending().unwrap().is_empty());
        r.mode = "serial".into();
        r.state.as_mut().unwrap().connected = false;
        assert!(
            r.command(
                "setGate",
                json!({"taskId":"task","batchId":"b1","value":0.5})
            )
            .is_err()
        );
        assert!(r.state.as_ref().unwrap().gate_overrides.is_empty());
    }
    #[test]
    fn pause_keeps_count_and_matrix() {
        let mut r = fixture();
        r.command("prepareBox", json!({})).unwrap();
        r.command("identify", json!({"residentId":"r"})).unwrap();
        r.command("authorize", json!({})).unwrap();
        r.command("start", json!({})).unwrap();
        r.tick().unwrap();
        r.tick().unwrap();
        let count = r.state.as_ref().unwrap().count;
        r.command("pause", json!({})).unwrap();
        r.tick().unwrap();
        r.tick().unwrap();
        assert_eq!(r.state.as_ref().unwrap().count, count);
        r.command("resume", json!({})).unwrap();
        assert_eq!(r.state.as_ref().unwrap().count, count);
    }
    #[test]
    fn exit_pauses_running_task_and_preserves_progress() {
        let mut r = fixture();
        r.command("prepareExit", json!({})).unwrap();
        assert_eq!(r.state.as_ref().unwrap().phase, "ready");
        r.command("prepareBox", json!({})).unwrap();
        r.command("identify", json!({"residentId":"r"})).unwrap();
        r.command("authorize", json!({})).unwrap();
        r.command("start", json!({})).unwrap();
        r.tick().unwrap();
        let count = r.state.as_ref().unwrap().count;
        r.command("prepareExit", json!({})).unwrap();
        let state = r.state.as_ref().unwrap();
        assert_eq!(state.phase, "paused");
        assert_eq!(state.count, count);
        assert_eq!(state.batch_index, 0);
        let events = r.pending().unwrap();
        assert!(
            events
                .iter()
                .any(|event| event["type"] == "task.exit_requested")
        );
        assert_eq!(
            events
                .iter()
                .filter(|event| event["type"] == "batch.started")
                .count(),
            1
        );
    }
    #[test]
    fn offline_does_not_allow_new_start_authorization() {
        let mut r = fixture();
        r.command("network", json!({"online":false})).unwrap();
        assert!(r.command("authorize", json!({})).is_err());
    }
    #[test]
    fn reached_target_waits_for_finish_and_tray_confirmation() {
        let mut r = fixture();
        r.command("prepareBox", json!({})).unwrap();
        r.command("identify", json!({"residentId":"r"})).unwrap();
        r.command("authorize", json!({})).unwrap();
        r.command("start", json!({})).unwrap();
        for _ in 0..6 {
            r.tick().unwrap();
        }
        assert_eq!(r.state.as_ref().unwrap().count, 3);
        assert_eq!(r.state.as_ref().unwrap().phase, "running");
        r.tick().unwrap();
        r.tick().unwrap();
        assert_eq!(r.state.as_ref().unwrap().phase, "tray_change");
        assert!(r.command("start", json!({})).is_err());
        assert!(r.command("tray", json!({})).is_err());
        r.command("identify", json!({"residentId":"r"})).unwrap();
        r.command("tray", json!({})).unwrap();
        assert_eq!(r.state.as_ref().unwrap().phase, "running");
        assert_eq!(r.state.as_ref().unwrap().batch_index, 1);
        assert_eq!(r.state.as_ref().unwrap().count, 0);
    }
    #[test]
    fn opening_is_required_and_not_repeated_by_identification() {
        let mut r = fixture();
        assert!(r.command("identify", json!({"residentId":"r"})).is_err());
        r.command("prepareBox", json!({})).unwrap();
        let sequence = r.state.as_ref().unwrap().sequence;
        r.command("prepareBox", json!({})).unwrap();
        assert_eq!(r.state.as_ref().unwrap().sequence, sequence);
        assert!(
            r.command("identify", json!({"residentId":"r","taskId":"old-task"}))
                .is_err()
        );
        r.command(
            "identify",
            json!({"residentId":"r","source":"barcode","raw":"PX:r"}),
        )
        .unwrap();
        assert_eq!(
            r.state.as_ref().unwrap().identified_resident_id.as_deref(),
            Some("r")
        );
    }
    #[test]
    fn both_sources_are_unified_and_conflicts_block_start() {
        let mut r = fixture();
        r.command("prepareBox", json!({})).unwrap();
        r.observe_box("rfid", Some("r".into()), "UID:AB12", false)
            .unwrap();
        assert_eq!(
            r.state.as_ref().unwrap().identified_resident_id.as_deref(),
            Some("r")
        );
        r.command(
            "identify",
            json!({"residentId":"r","source":"barcode","raw":"PX:r"}),
        )
        .unwrap();
        assert!(r.state.as_ref().unwrap().identification_issue.is_none());
        r.observe_box("rfid", Some("other".into()), "UID:CD34", false)
            .unwrap();
        assert!(r.state.as_ref().unwrap().identified_resident_id.is_none());
        assert!(r.command("authorize", json!({})).is_err());
        r.observe_box("rfid", None, "NO CARD", true).unwrap();
        assert_eq!(
            r.state.as_ref().unwrap().identified_resident_id.as_deref(),
            Some("r")
        );
        r.command("identifyAbsent", json!({"source":"barcode"}))
            .unwrap();
        assert!(r.state.as_ref().unwrap().identified_resident_id.is_none());
    }
    #[test]
    fn unbound_rfid_does_not_disable_a_valid_barcode() {
        let mut r = fixture();
        r.command("prepareBox", json!({})).unwrap();
        r.observe_box("rfid", None, "UID:AB12", false).unwrap();
        assert!(r.state.as_ref().unwrap().identification_issue.is_some());
        let status = r.command("status", json!({})).unwrap();
        assert_eq!(
            status["state"]["identificationSources"]["rfid"]["raw"],
            "UID:AB12"
        );
        assert!(status["state"]["identificationSources"]["rfid"]["residentId"].is_null());
        r.command(
            "identify",
            json!({"residentId":"r","source":"barcode","raw":"PX:r"}),
        )
        .unwrap();
        assert_eq!(
            r.state.as_ref().unwrap().identified_resident_id.as_deref(),
            Some("r")
        );
        assert!(r.state.as_ref().unwrap().identification_issue.is_none());
    }
    #[test]
    fn saving_binding_resolves_current_unbound_uid_without_machine_commands() {
        let mut r = fixture();
        r.command("prepareBox", json!({})).unwrap();
        r.last_uid = Some("0000AB12".into());
        r.observe_box("rfid", None, "UID:0000AB12", false).unwrap();
        r.command("configure", json!({"apiUrl":"http://127.0.0.1:4310","token":"test","institutionId":"a","terminalId":"pc","deviceId":"dev","rfidBindings":{"0000AB12":"r"}})).unwrap();
        assert_eq!(
            r.state.as_ref().unwrap().identified_resident_id.as_deref(),
            Some("r")
        );
        let events: Vec<Value> = r.pending().unwrap();
        assert!(!events.iter().any(
            |event| event["type"] == "device.sent" || event["type"] == "batch.start_requested"
        ));
        r.last_uid = None;
        r.observe_box("rfid", None, "NO CARD", true).unwrap();
        assert!(r.state.as_ref().unwrap().identified_resident_id.is_none());
    }
}
