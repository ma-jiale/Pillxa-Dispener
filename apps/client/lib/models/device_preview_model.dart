import 'package:flutter/foundation.dart';

/// UI-only device state. Never grants permission to operate a physical machine.
class DevicePreviewModel extends ChangeNotifier {
  final List<String> _devices = [];
  String? _connectedDevice;

  List<String> get devices => List.unmodifiable(_devices);
  String? get connectedDevice => _connectedDevice;

  void add(String name) {
    if (_devices.contains(name)) return;
    _devices.add(name);
    notifyListeners();
  }

  void connect(String name) {
    if (!_devices.contains(name)) return;
    _connectedDevice = name;
    notifyListeners();
  }

  void disconnect() {
    _connectedDevice = null;
    notifyListeners();
  }

  void remove(String name) {
    _devices.remove(name);
    if (_connectedDevice == name) _connectedDevice = null;
    notifyListeners();
  }
}
