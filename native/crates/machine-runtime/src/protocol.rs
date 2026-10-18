//! STM32 compatibility boundary. No business decisions or serial I/O here.
use serde_json::{Value, json};
pub fn frame(command: u8, payload: &[u8]) -> Vec<u8> {
    let sum = payload
        .iter()
        .fold(command as u16, |sum, byte| sum.wrapping_add(*byte as u16));
    let mut result = vec![0xaa, 0xbb, command];
    result.extend_from_slice(payload);
    result.extend(sum.to_le_bytes());
    result
}
pub fn parameter(object: u8, value: f32) -> Vec<u8> {
    let mut payload = vec![object];
    payload.extend(value.to_le_bytes());
    frame(8, &payload)
}
pub fn matrix(rows: &Value) -> Result<Vec<u8>, String> {
    let mut payload = [0u8; 28];
    let rows = rows.as_array().ok_or("矩阵格式无效")?;
    if rows.len() > 4 {
        return Err("机器最多四行".into());
    }
    for (physical, row) in rows.iter().enumerate() {
        let row = row.as_array().ok_or("矩阵行无效")?;
        if row.len() != 7 {
            return Err("机器每行需要七列".into());
        }
        let protocol_row = [2, 1, 0, 3][physical];
        for (column, count) in row.iter().enumerate() {
            payload[protocol_row * 7 + column] = count
                .as_u64()
                .filter(|n| *n <= 255)
                .ok_or("每格颗数需要为 0–255 的整数")?
                as u8;
        }
    }
    Ok(frame(5, &payload))
}
pub fn parse(line: &str) -> Value {
    let compact = line.replace(' ', "");
    if compact == "ACK" {
        return json!({"type":"ack"});
    }
    if compact == "DONE" {
        return json!({"type":"done"});
    }
    if compact == "machine_state:FINISH" {
        return json!({"type":"finish"});
    }
    if compact == "machine_state:CNT_ERR" {
        return json!({"type":"fault","reason":"机器报告计数异常"});
    }
    if compact == "machineinit" {
        return json!({"type":"reset"});
    }
    if compact == "NOCARD" {
        return json!({"type":"absent"});
    }
    if let Some(uid) = compact.strip_prefix("UID:") {
        if !uid.is_empty() && uid.len() <= 64 && uid.bytes().all(|b| b.is_ascii_hexdigit()) {
            return json!({"type":"uid","uid":uid.to_uppercase()});
        }
    }
    if let Some(value) = compact.strip_prefix("number:") {
        if let Some((number, width)) = value
            .split_once(",width:")
            .or_else(|| value.split_once("width:"))
        {
            if let (Ok(number), Ok(width)) = (
                number.trim_end_matches(',').parse::<u64>(),
                width.parse::<f64>(),
            ) {
                return json!({"type":"progress","count":number,"width":width});
            }
        }
    }
    if let Some(value) = compact.strip_prefix("pillsout:") {
        if let Ok(count) = value.parse::<u64>() {
            return json!({"type":"progress","count":count});
        }
    }
    if compact.starts_with("stalled:") || compact.starts_with("stall") {
        return json!({"type":"fault","reason":"机器报告堵转","raw":line});
    }
    json!({"type":"diagnostic","raw":line})
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn checksum_and_float_little_endian() {
        assert_eq!(frame(3, &[]), vec![170, 187, 3, 3, 0]);
        let p = parameter(0, 0.2);
        assert_eq!(&p[4..8], &0.2f32.to_le_bytes());
        assert_eq!(p.len(), 10);
        assert_eq!(
            parameter(1, 0.7),
            vec![0xaa, 0xbb, 8, 1, 0x33, 0x33, 0x33, 0x3f, 0xe1, 0]
        );
    }
    #[test]
    fn physical_to_protocol_rows() {
        let m = matrix(&json!([
            [1, 0, 0, 0, 0, 0, 0],
            [2, 0, 0, 0, 0, 0, 0],
            [3, 0, 0, 0, 0, 0, 0],
            [4, 0, 0, 0, 0, 0, 0]
        ]))
        .unwrap();
        assert_eq!((m[3], m[10], m[17], m[24]), (3, 2, 1, 4));
        assert_eq!(&m[31..], &15u16.to_le_bytes());
    }
    #[test]
    fn feedback_variants() {
        assert_eq!(parse("number:9 width:20")["count"], 9);
        assert_eq!(parse("number: 9, width: 20")["width"].as_f64(), Some(20.0));
        assert_eq!(parse("ACK")["type"], "ack");
        assert_eq!(parse("machine_state:FINISH")["type"], "finish");
        assert_eq!(parse("UID: ab12")["uid"], "AB12");
        assert_eq!(parse("UID:xy")["type"], "diagnostic");
    }
}
