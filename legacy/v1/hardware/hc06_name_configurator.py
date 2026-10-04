"""HC-06 name configurator (USB-TTL + AT commands).

Usage examples (Windows):

  # List available serial ports
  python hc06_name_configurator.py --list

  # Set HC-06 name to "MyBluetooth" (default baudrate 9600)
  python hc06_name_configurator.py --port COM6 --name MyBluetooth

  # If current baudrate is not 9600, specify it
  python hc06_name_configurator.py --port COM6 --name MyBluetooth --current-baud 115200

  # Some setups require CRLF; try this if you don't get OK
  python hc06_name_configurator.py --port COM6 --name MyBluetooth --terminator crlf

Notes (common HC-06 behavior):
- AT mode when powered on and NOT paired.
- Keep >= 1s between AT commands.
- Default baudrate is 9600 (8N1).
- Name can be up to 20 characters (varies by firmware).
- Changes take effect after power cycle.
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


def validate_name(name: str) -> str:
	"""Validate the Bluetooth name."""
	if not name:
		raise ValueError("Name cannot be empty")
	if len(name) > 20:
		raise ValueError(f"Name too long ({len(name)} chars). Maximum is 20 characters.")
	# Check for ASCII-only characters (HC-06 typically only supports ASCII)
	try:
		name.encode("ascii")
	except UnicodeEncodeError:
		raise ValueError("Name must contain only ASCII characters (no Chinese or special Unicode)")
	return name


def configure_hc06_name(
	*,
	port: str,
	current_baud: int,
	new_name: str,
	terminator: bytes,
	timeout_s: float,
	response_window_s: float,
	inter_command_delay_s: float,
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
		# First, test AT handshake
		print(f"[INFO] Testing AT handshake on {port} at {current_baud} baud...")
		resp = send_at_command(ser, "AT", terminator, response_window_s)
		ensure_ok(resp, context="AT handshake")
		print(f"[OK] AT handshake successful: {resp}")
		time.sleep(inter_command_delay_s)

		# Set the new name
		print(f"[INFO] Setting name to: {new_name}")
		resp = send_at_command(ser, f"AT+NAME{new_name}", terminator, response_window_s)
		ensure_ok(resp, context=f"AT+NAME{new_name}")
		print(f"[OK] Name set successfully: {resp}")


def build_parser() -> argparse.ArgumentParser:
	p = argparse.ArgumentParser(
		description="Configure HC-06 Bluetooth name over USB-TTL using AT commands"
	)
	p.add_argument("--list", action="store_true", help="List serial ports and exit")
	p.add_argument("--port", help="Serial port, e.g. COM6")
	p.add_argument(
		"--current-baud",
		type=int,
		default=9600,
		help="Current baudrate (default: 9600)",
	)
	p.add_argument(
		"--name",
		help="New Bluetooth name (max 20 ASCII characters)",
	)
	p.add_argument(
		"--terminator",
		choices=["none", "cr", "lf", "crlf"],
		default="none",
		help="Line terminator for AT commands (default: none)",
	)
	p.add_argument(
		"--timeout",
		type=float,
		default=1.0,
		help="Serial read/write timeout seconds",
	)
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

	if not args.name:
		print("Error: --name is required.", file=sys.stderr)
		return 2

	try:
		validated_name = validate_name(args.name)
		terminator = _terminator_bytes(args.terminator)
		configure_hc06_name(
			port=args.port,
			current_baud=args.current_baud,
			new_name=validated_name,
			terminator=terminator,
			timeout_s=args.timeout,
			response_window_s=args.response_window,
			inter_command_delay_s=args.inter_command_delay,
		)
	except Exception as exc:
		print(f"Failed: {exc}", file=sys.stderr)
		return 1

	print(f"\nSuccess: HC-06 name changed to '{validated_name}'.")
	print("Note: Power cycle the module for the new name to take effect.")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
