import 'dart:async';

import 'package:flutter/material.dart';

import '../models/demo_model.dart';
import '../models/device_preview_model.dart';
import '../widgets/dispenser_icon.dart';

const _muted = Color(0xff777777);
const _previewNote = '界面预览 · 示例设备，未连接真实硬件';

class DeviceStatusButton extends StatelessWidget {
  const DeviceStatusButton({
    super.key,
    required this.devices,
    required this.onPressed,
  });
  final DevicePreviewModel devices;
  final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: devices,
    builder: (context, _) => Tooltip(
      message: '我的设备 · 蓝牙 / USB 串口',
      child: OutlinedButton.icon(
        key: const ValueKey('device-status'),
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xff333333),
          backgroundColor: Colors.white,
          side: const BorderSide(color: Color(0xffe5e5e5)),
        ),
        onPressed: onPressed,
        icon: const DispenserIcon(size: 22),
        label: Text(devices.connectedDevice == null ? '未连接' : '已连接'),
      ),
    ),
  );
}

class DevicesPage extends StatefulWidget {
  const DevicesPage({
    super.key,
    required this.devices,
    required this.taskModel,
  });
  final DevicePreviewModel devices;
  final DemoModel taskModel;
  @override
  State<DevicesPage> createState() => _DevicesPageState();
}

class _DevicesPageState extends State<DevicesPage> {
  bool _adding = false;
  bool _searching = false;
  Timer? _timer;
  String? _notice;
  // UI fixtures only. Names are not production device identities.
  static const _nearby = [
    'PillDispenser01',
    'PillDispenser02',
    'PillDispenser03',
    'USB 串口设备',
  ];
  String _transport(String name) => name.startsWith('USB') ? 'USB 串口' : '蓝牙串口';
  void _scan() {
    _timer?.cancel();
    setState(() {
      _adding = true;
      _searching = true;
      _notice = null;
    });
    _timer = Timer(const Duration(milliseconds: 1200), () {
      if (mounted) setState(() => _searching = false);
    });
  }

  void _back() {
    _timer?.cancel();
    setState(() {
      _adding = false;
      _searching = false;
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _change(VoidCallback action) {
    if (widget.taskModel.active) {
      setState(() => _notice = '请先完成或结束当前摆药，再更改设备连接。');
      return;
    }
    setState(() => _notice = null);
    action();
  }

  Future<void> _remove(String name) async {
    if (widget.taskModel.active) {
      _change(() {});
      return;
    }
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('移除设备？'),
        content: Text('从我的设备中移除 $name，之后可重新添加。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('移除'),
          ),
        ],
      ),
    );
    if (result == true && mounted) _change(() => widget.devices.remove(name));
  }

  @override
  Widget build(BuildContext context) => Dialog(
    insetPadding: EdgeInsets.all(
      MediaQuery.sizeOf(context).width < 600 ? 12 : 40,
    ),
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 960, maxHeight: 820),
      child: Padding(
        padding: EdgeInsets.all(
          MediaQuery.sizeOf(context).width < 600 ? 16 : 28,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                if (_adding)
                  IconButton(
                    tooltip: '返回我的设备',
                    onPressed: _back,
                    icon: const Icon(Icons.arrow_back_rounded, size: 20),
                  ),
                const Spacer(),
                IconButton(
                  tooltip: '关闭我的设备',
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded, size: 20),
                ),
              ],
            ),
            if (!_adding) ...[
              const Text(
                '我的设备',
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 10),
              const Text(
                '请打开摆药机电源，通过蓝牙或 USB 连接。',
                style: TextStyle(fontSize: 13, height: 1.6, color: _muted),
              ),
              const SizedBox(height: 24),
            ],
            Expanded(child: _adding ? _searchBody() : _deviceList()),
            if (_notice != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  _notice!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xffa62929),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Center(
              child: _adding
                  ? TextButton.icon(
                      key: const ValueKey('rescan-devices'),
                      onPressed: _searching ? null : _scan,
                      icon: const Icon(Icons.refresh_rounded, size: 18),
                      label: const Text('重新搜索'),
                    )
                  : OutlinedButton.icon(
                      key: const ValueKey('add-device'),
                      onPressed: _scan,
                      icon: const Icon(Icons.add_rounded, size: 20),
                      label: const Text('添加新设备'),
                    ),
            ),
            const SizedBox(height: 12),
            const Text(
              _previewNote,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: _muted),
            ),
          ],
        ),
      ),
    ),
  );
  Widget _deviceList() => ListenableBuilder(
    listenable: widget.devices,
    builder: (context, _) => widget.devices.devices.isEmpty
        ? const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DispenserIcon(size: 64, color: Color(0xffaaaaaa)),
                SizedBox(height: 20),
                Text('还没有添加设备', style: TextStyle(color: _muted, fontSize: 14)),
              ],
            ),
          )
        : ListView(
            children: [
              for (final name in widget.devices.devices) _row(name, false),
            ],
          ),
  );
  Widget _searchBody() => ListView(
    children: [
      const SizedBox(height: 24),
      Center(
        child: Container(
          width: 112,
          height: 112,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0xfff5f5f5),
            border: Border.all(color: const Color(0xffe9e9e9)),
          ),
          child: const Center(child: DispenserIcon(size: 48)),
        ),
      ),
      const SizedBox(height: 28),
      const Text(
        '确保摆药机已开机',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 8),
      const Text(
        '蓝牙设备请靠近终端；USB 设备请插入数据线。',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 12, color: _muted, height: 1.6),
      ),
      const SizedBox(height: 20),
      Semantics(
        liveRegion: true,
        child: Text(
          _searching ? '正在查找可用设备…' : '选择要添加的摆药机',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12, color: _muted),
        ),
      ),
      const SizedBox(height: 24),
      if (_searching)
        const Center(
          child: SizedBox(
            width: 120,
            child: LinearProgressIndicator(minHeight: 2),
          ),
        )
      else ...[
        for (final name in _nearby) _row(name, true),
      ],
    ],
  );
  Widget _row(String name, bool discovery) {
    final connected = widget.devices.connectedDevice == name;
    final added = widget.devices.devices.contains(name);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 4),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xffeeeeee))),
      ),
      child: Row(
        children: [
          const DispenserIcon(size: 38),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  discovery
                      ? _transport(name)
                      : '${connected ? '已连接' : '未连接'} · ${_transport(name)}',
                  style: const TextStyle(fontSize: 12, color: _muted),
                ),
              ],
            ),
          ),
          TextButton(
            key: ValueKey(
              discovery
                  ? 'add-$name'
                  : '${connected ? 'disconnect' : 'connect'}-$name',
            ),
            onPressed: discovery
                ? (added
                      ? null
                      : () {
                          widget.devices.add(name);
                          _back();
                        })
                : () => _change(
                    () => connected
                        ? widget.devices.disconnect()
                        : widget.devices.connect(name),
                  ),
            child: Text(
              discovery ? (added ? '已添加' : '添加') : (connected ? '断开' : '连接'),
            ),
          ),
          if (!discovery)
            IconButton(
              key: ValueKey('remove-$name'),
              tooltip: '移除设备',
              onPressed: () => _remove(name),
              icon: const Icon(Icons.close_rounded, size: 16, color: _muted),
            ),
        ],
      ),
    );
  }
}
