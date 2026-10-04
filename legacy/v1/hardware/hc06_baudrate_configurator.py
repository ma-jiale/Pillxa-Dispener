"""HC-06 baudrate configurator (USB-TTL + AT commands).

Usage examples (Windows):

  # List available serial ports
  python hc06_baudrate_configurator.py --list

  # Set HC-06 from 9600 (factory default) to 115200, AT commands without CR/LF
  python hc06_baudrate_configurator.py --port COM6 --current-baud 9600 --target-baud 115200

  # Some setups require CRLF; try this if you don't get OK
  python hc06_baudrate_configurator.py --port COM6 --target-baud 115200 --terminator crlf

Notes (common HC-06 behavior):
- AT mode when powered on and NOT paired.
- Keep >= 1s between AT commands.
- Default baudrate is 9600 (8N1).
"""

from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from typing import Iterable, Optional


try:
	import serial  # type: ignore
	from serial.tools import list_ports  # type: ignore
except Exception as exc:  # pragma: no cover
	raise SystemExit(
		"Missing dependency 'pyserial'. Install with: pip install pyserial\n"
		f"Original import error: {exc}"
	)


BAUD_TO_CODE: dict[int, str] = {
	1200: "1",
	2400: "2",
	4800: "3",
	9600: "4",
	19200: "5",
	38400: "6",
	57600: "7",
	115200: "8",
	230400: "9",
	460800: "A",
	921600: "B",
	1382400: "C",
}
CODE_TO_BAUD: dict[str, int] = {v: k for k, v in BAUD_TO_CODE.items()}


@dataclass(frozen=True)
class SerialConfig:
	port: str
	baudrate: int
	timeout_s: float
	write_timeout_s: float


def _terminator_bytes(name: str) -> bytes:
	name = name.lower().strip()
	if name == "none":
		return b""
	if name == "cr":
		return b"\r"
	if name == "lf":
		return b"\n"
	if name == "crlf":
		return b"\r\n"
	raise ValueError(f"Unknown terminator: {name}")


def list_serial_ports() -> list[str]:
	ports = []
	for p in list_ports.comports():
		desc = p.description or ""
		hwid = p.hwid or ""
		if desc or hwid:
			ports.append(f"{p.device}  -  {desc}  ({hwid})")
		else:
			ports.append(p.device)
	return ports


def _read_available_text(ser: "serial.Serial", window_s: float) -> str:
	"""Read whatever the device outputs during the time window."""
	end = time.monotonic() + window_s
	chunks: list[bytes] = []
	while time.monotonic() < end:
		waiting = getattr(ser, "in_waiting", 0) or 0
		if waiting:
			chunks.append(ser.read(waiting))
			end = time.monotonic() + window_s
		else:
			time.sleep(0.02)
	data = b"".join(chunks)
	return data.decode(errors="replace").strip()


def send_at_command(
	ser: "serial.Serial",
	command: str,
	terminator: bytes,
	response_window_s: float,
) -> str:
	payload = command.encode("ascii") + terminator
	ser.reset_input_buffer()
	ser.write(payload)
	ser.flush()
	return _read_available_text(ser, window_s=response_window_s)


def ensure_ok(response: str, *, context: str) -> None:
	if "OK" not in response.upper():
		raise RuntimeError(
			f"No OK response for {context}. Received: {response!r}.\n"
			"Troubleshooting: check wiring (TX/RX crossed, common GND), ensure module not paired,\n"
			"use 3.3V power (not 5V), and try --terminator none/crlf or the correct --current-baud."
		)


def baud_to_code(*, target_baud: Optional[int], code: Optional[str]) -> tuple[str, int]:
	if (target_baud is None) == (code is None):
		raise ValueError("Provide exactly one of --target-baud or --code")

	if code is not None:
		c = code.strip().upper()
		if c not in CODE_TO_BAUD:
			raise ValueError(f"Unknown baud code {c!r}. Valid: {', '.join(CODE_TO_BAUD)}")
		return c, CODE_TO_BAUD[c]

	assert target_baud is not None
	if target_baud not in BAUD_TO_CODE:
		valid = ", ".join(str(b) for b in sorted(BAUD_TO_CODE))
		raise ValueError(f"Unsupported target baudrate {target_baud}. Valid: {valid}")
	return BAUD_TO_CODE[target_baud], target_baud


def configure_hc06_baudrate(
	*,
	port: str,
	current_baud: int,
	target_code: str,
	target_baud: int,
	terminator: bytes,
	timeout_s: float,
	response_window_s: float,
	inter_command_delay_s: float,
	verify: bool,
) -> None:
	cfg = SerialConfig(
		port=port,
		baudrate=current_baud,
		timeout_s=timeout_s,
		write_timeout_s=timeout_s,
	)

	with serial.Serial(
		port=cfg.port,
		baudrate=cfg.baudrate,
		timeout=cfg.timeout_s,
		write_timeout=cfg.write_timeout_s,
		bytesize=serial.EIGHTBITS,
		parity=serial.PARITY_NONE,
		stopbits=serial.STOPBITS_ONE,
	) as ser:
		resp = send_at_command(ser, "AT", terminator, response_window_s)
		ensure_ok(resp, context="AT handshake")
		time.sleep(inter_command_delay_s)

		resp = send_at_command(ser, f"AT+BAUD{target_code}", terminator, response_window_s)
		ensure_ok(resp, context=f"AT+BAUD{target_code} (set baudrate to {target_baud})")

	if not verify:
		return

	time.sleep(inter_command_delay_s)
	with serial.Serial(
		port=port,
		baudrate=target_baud,
		timeout=timeout_s,
		write_timeout=timeout_s,
		bytesize=serial.EIGHTBITS,
		parity=serial.PARITY_NONE,
		stopbits=serial.STOPBITS_ONE,
	) as ser:
		resp = send_at_command(ser, "AT", terminator, response_window_s)
		ensure_ok(resp, context=f"verify AT at new baudrate ({target_baud})")


def build_parser() -> argparse.ArgumentParser:
	p = argparse.ArgumentParser(description="Configure HC-06 baudrate over USB-TTL using AT commands")
	p.add_argument("--list", action="store_true", help="List serial ports and exit")
	p.add_argument("--port", help="Serial port, e.g. COM6")
	p.add_argument("--current-baud", type=int, default=9600, help="Current baudrate (default: 9600)")
	p.add_argument("--target-baud", type=int, help="Target baudrate, e.g. 115200")
	p.add_argument(
		"--code",
		help="HC-06 baud code (1..9,A,B,C). Alternative to --target-baud",
	)
	p.add_argument(
		"--terminator",
		choices=["none", "cr", "lf", "crlf"],
		default="none",
		help="Line terminator for AT commands (default: none)",
	)
	p.add_argument("--timeout", type=float, default=1.0, help="Serial read/write timeout seconds")
	p.add_argument(
		"--response-window",
		type=float,
		default=0.6,
		help="How long to collect response after each command (seconds)",
	)
	p.add_argument(
		"--inter-command-delay",
		type=float,
		default=1.1,
		help="Delay between AT commands (manual suggests >= 1s)",
	)
	p.add_argument(
		"--no-verify",
		action="store_true",
		help="Skip reopening serial port at new baudrate to verify",
	)
	return p


def main(argv: Optional[Iterable[str]] = None) -> int:
	args = build_parser().parse_args(list(argv) if argv is not None else None)

	if args.list:
		ports = list_serial_ports()
		if not ports:
			print("No serial ports found.")
			return 1
		print("Available serial ports:")
		for line in ports:
			print(f"  {line}")
		return 0

	if not args.port:
		print("Error: --port is required (or use --list).", file=sys.stderr)
		return 2

	try:
		target_code, target_baud = baud_to_code(target_baud=args.target_baud, code=args.code)
		terminator = _terminator_bytes(args.terminator)
		configure_hc06_baudrate(
			port=args.port,
			current_baud=args.current_baud,
			target_code=target_code,
			target_baud=target_baud,
			terminator=terminator,
			timeout_s=args.timeout,
			response_window_s=args.response_window,
			inter_command_delay_s=args.inter_command_delay,
			verify=not args.no_verify,
		)
	except Exception as exc:
		print(f"Failed: {exc}", file=sys.stderr)
		return 1

	print(f"Success: set {args.port} to baudrate {target_baud} (code {target_code}).")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
