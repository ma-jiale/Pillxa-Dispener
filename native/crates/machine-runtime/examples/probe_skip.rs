//! Explicit, operator-authorized bench test. Never sends a dispensing matrix.
use chrono::Utc;
use serde_json::{Value, json};
use std::{
    io::Write,
    time::{Duration, Instant},
};

fn collect(
    port: &mut dyn serialport::SerialPort,
    duration: Duration,
    buffer: &mut Vec<u8>,
) -> Result<Vec<Value>, String> {
    let started = Instant::now();
    let mut lines = Vec::new();
    while started.elapsed() < duration {
        let mut bytes = [0; 1024];
        match port.read(&mut bytes) {
            Ok(count) => buffer.extend_from_slice(&bytes[..count]),
            Err(error) if error.kind() == std::io::ErrorKind::TimedOut => {}
            Err(error) => return Err(error.to_string()),
        }
        while let Some(end) = buffer.iter().position(|b| *b == b'\n') {
            let raw = String::from_utf8_lossy(&buffer.drain(..=end).collect::<Vec<_>>())
                .trim()
                .to_string();
            if !raw.is_empty() {
                lines.push(json!({"receivedAt":Utc::now().to_rfc3339(),"line":raw}));
            }
        }
    }
    Ok(lines)
}
fn frame(command: u8, payload: &[u8]) -> Vec<u8> {
    let sum = payload
        .iter()
        .fold(command as u16, |sum, byte| sum + *byte as u16);
    let mut bytes = vec![0xaa, 0xbb, command];
    bytes.extend_from_slice(payload);
    bytes.extend_from_slice(&sum.to_le_bytes());
    bytes
}
fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        return Err("Expected explicit COM port and project report path".into());
    }
    let mut port = serialport::new(&args[1], 115200)
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .flow_control(serialport::FlowControl::None)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|error| error.to_string())?;
    let mut buffer = Vec::new();
    let initial = collect(&mut *port, Duration::from_secs(1), &mut buffer)?;
    let mut stages = vec![json!({"stage":"initial","received":initial})];
    let mut payload = vec![0];
    payload.extend_from_slice(&0.0f32.to_le_bytes());
    for (stage, bytes) in [
        ("stop", frame(8, &payload)),
        ("exit_current_drug", frame(0, &[])),
        ("open", frame(3, &[])),
    ] {
        let sent_at = Utc::now().to_rfc3339();
        port.write_all(&bytes)
            .and_then(|_| port.flush())
            .map_err(|error| error.to_string())?;
        // Observation window for this bench test, not a production mechanical timeout.
        let received = collect(&mut *port, Duration::from_secs(5), &mut buffer)?;
        let has_ack = received
            .iter()
            .any(|line| line["line"].as_str() == Some("ACK"));
        stages.push(json!({"stage":stage,"sentAt":sent_at,"bytes":bytes,"received":received}));
        if stage == "stop" && !has_ack {
            break;
        }
    }
    let report = json!({"port":args[1],"baudRate":115200,"matrixSent":false,"stages":stages});
    std::fs::write(&args[2], serde_json::to_string_pretty(&report).unwrap())
        .map_err(|error| error.to_string())?;
    println!(
        "{}",
        json!({"report":args[2],"matrixSent":false,"stages":stages.iter().map(|stage| json!({"stage":stage["stage"],"sentAt":stage["sentAt"],"responses":stage["received"].as_array().unwrap().iter().filter_map(|line|line["line"].as_str()).filter(|line|!line.starts_with("UID:")).collect::<Vec<_>>()})).collect::<Vec<_>>()})
    );
    Ok(())
}
