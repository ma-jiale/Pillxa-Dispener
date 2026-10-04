using UnityEngine;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using System.Linq;
using EZDose;

namespace EZDose.Hardware
{
    /// <summary>
    /// Dispenser controller - Communicates with STM32 via Bluetooth serial port
    /// Controls pill dispensing, receives feedback, manages machine state
    /// </summary>
    public class DispenserController : MonoBehaviour
    {
        [Header("蓝牙配置")]
        [SerializeField] private string deviceMacAddress = "00:00:00:00:00:00";
        [Header("Windows Serial Port")]
        [SerializeField] private int windowsBaudRate = 115200;
        [SerializeField] private int serialReadTimeoutMs = 50;
        [SerializeField] private int serialWriteTimeoutMs = 200;
        [Header("分药机配置")]
        [SerializeField] private int maxRetryCount = 5;
        [SerializeField] private float ackTimeout = 0.2f;
        [SerializeField] private float windowsAckTimeout = 1.0f;
        [SerializeField] private float resetDoneTimeout = 10f;

        // 蓝牙通信对象
        private AndroidJavaObject bluetoothSerial;
        private IDispenserTransport transport;
        
        // Currently connected device info
        private BluetoothDeviceInfo connectedDevice;
        private List<BluetoothDeviceInfo> discoveredDevices = new List<BluetoothDeviceInfo>();
        
        // 状态变量
        private bool isConnected = false;
        private bool isTrayOpened = false;
        private bool isReceiving = false;
        private bool isSendingPackage = false;
        private bool isPaused = false;
        
        // 心跳检测
        private Coroutine heartbeatCoroutine;
        private const float HEARTBEAT_INTERVAL = 1f;  // 每1秒检测一次
        
        // 机器状态 0:空闲 1:工作中 2:暂停 3:完成
        private int machineState = 0;
        
        // 错误代码 0:正常 1:超时 2:计数错误
        private int errorCode = 0;
        
        // 药片计数
        private int pillRemain = -1;
        private int totalPills = 0;
        
        // 反馈标志
        private bool ackReceived = false;
        private bool doneReceived = false;

        // RFID state reported asynchronously by the STM32 while the tray is open.
        private string currentRfidUid;
        private bool isRfidCardPresent;
        
        // 接收缓冲区
        private StringBuilder receiveBuffer = new StringBuilder();
        
        // events
        public event Action OnMachineInit; // unused
        public event Action OnDispensingComplete;
        public event Action OnCountError;
        public event Action<int> OnMotorStalled;
        public event Action<string> OnBTError; 
        public event Action<string> OnError; 
        public event Action<int, int> OnOptoPulseReceived;  // (pulseWidth, sequenceNumber)
        public event Action<int> OnPillCountUpdate;
        public event Action<bool> OnPauseStateChanged;
        public event Action<int> OnCleanCompleted;  // cleaned pills count
        public event Action<string> OnRfidCardPlaced;
        public event Action<string> OnRfidCardRemoved;
        public event Action<string, string> OnRfidCardChanged;
        // Raised for every hardware UID/NO CARD report, including unchanged states.
        public event Action<bool, string> OnRfidPresenceReported;

        
        // Bluetooth device discovery events
        public event Action<List<BluetoothDeviceInfo>> OnDevicesFound;
        public event Action OnDiscoveryStarted;
        public event Action OnDiscoveryCompleted;
        public event Action<string> OnConnectionStateChanged; // Connected, Disconnected, Connecting

        #region 初始化和连接

        private void Awake()
        {
            // Keep dispenser alive across scenes (like MainController)
            DontDestroyOnLoad(gameObject);
        }

        /// <summary>
        /// Initialize dispenser controller and connect to the configured device.
        /// </summary>
        public bool Initialize(string macAddress = null)
        {
            if (!string.IsNullOrEmpty(macAddress))
            {
                deviceMacAddress = macAddress;
            }

            EZLog.I(EZLog.Module.Dispenser, $"Initialization started, MAC address: {deviceMacAddress}");

            try
            {
                if (!ConnectBluetooth())
                {
                    EZLog.E(EZLog.Module.Dispenser, "Bluetooth connection failed");
                    return false;
                }

                StartReceiving();
                StartHeartbeat();
                EZLog.I(EZLog.Module.Dispenser, "Initialization succeeded");
                return true;
            }
            catch (Exception e)
            {
                EZLog.E(EZLog.Module.Dispenser, "Initialization exception", e);
                return false;
            }
        }

        /// <summary>
        /// 连接蓝牙设备
        /// </summary>
        private bool ConnectBluetooth()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                if (bluetoothSerial == null)
                {
                    AndroidJavaClass unityPlayer = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
                    AndroidJavaObject activity = unityPlayer.GetStatic<AndroidJavaObject>("currentActivity");
                    bluetoothSerial = new AndroidJavaObject("com.unity.bluetooth.BluetoothSerial", activity);
                }

                bool isAvailable = bluetoothSerial.Call<bool>("isBluetoothAvailable");
                if (!isAvailable)
                {
                    EZLog.E(EZLog.Module.Dispenser, "Device does not support Bluetooth");
                    return false;
                }

                bool isEnabled = bluetoothSerial.Call<bool>("isBluetoothEnabled");
                if (!isEnabled)
                {
                    EZLog.E(EZLog.Module.Dispenser, "Bluetooth is not enabled");
                    return false;
                }

                bool connected = bluetoothSerial.Call<bool>("connect", deviceMacAddress);
                if (connected)
                {
                    isConnected = true;
                    EZLog.I(EZLog.Module.Dispenser, $"Connected to device: {deviceMacAddress}");
                    return true;
                }
                else
                {
                    EZLog.E(EZLog.Module.Dispenser, $"Connection failed: {deviceMacAddress}");
                    return false;
                }
            }
            catch (Exception e)
            {
                EZLog.E(EZLog.Module.Dispenser, "Bluetooth connection exception", e);
                return false;
            }
#else
            // 编辑器模式模拟连接
            return ConnectWindowsTransport();
#endif
        }

        private bool ConnectWindowsTransport()
        {
            try
            {
                bool connected = GetOrCreateWindowsTransport().Connect(deviceMacAddress);
                isConnected = connected;

                if (connected)
                {
                    EZLog.I(EZLog.Module.Dispenser, $"Connected to serial port: {deviceMacAddress}");
                }

                return connected;
            }
            catch (Exception e)
            {
                EZLog.E(EZLog.Module.Dispenser, "Windows serial connection exception", e);
                return false;
            }
        }

        private IDispenserTransport GetOrCreateWindowsTransport()
        {
            if (transport == null)
            {
                transport = new WindowsSerialTransport(windowsBaudRate, serialReadTimeoutMs, serialWriteTimeoutMs);
            }

            return transport;
        }

        /// <summary>
        /// 断开连接
        /// </summary>
        public void Disconnect()
        {
            StopHeartbeat();
            isReceiving = false;

#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                if (bluetoothSerial != null && isConnected)
                {
                    bluetoothSerial.Call("disconnect");
                    EZLog.I(EZLog.Module.Dispenser, "Bluetooth disconnected");
                }
            }
            catch (Exception e)
            {
                EZLog.E(EZLog.Module.Dispenser, "Disconnect exception", e);
            }
#endif

#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
            try
            {
                if (transport != null)
                {
                    transport.Disconnect();
                }
                EZLog.I(EZLog.Module.Dispenser, "Serial port disconnected");
            }
            catch (Exception e)
            {
                EZLog.E(EZLog.Module.Dispenser, "Serial disconnect exception", e);
            }
#endif

            isConnected = false;
            ResetState();
        }

        /// <summary>
        /// 重置所有状态
        /// </summary>
        private void ResetState()
        {
            machineState = 0;
            errorCode = 0;
            pillRemain = -1;
            totalPills = 0;
            ackReceived = false;
            doneReceived = false;
            isSendingPackage = false;
            isPaused = false;
            ClearRfidStateWithoutEvent();
            receiveBuffer.Clear();
        }

        /// <summary>
        /// 检测到连接丢失时的统一处理（防重入）
        /// 由心跳检测或发送失败触发，自动清理状态并通知 UI
        /// </summary>
        private void HandleConnectionLost(string reason)
        {
            if (!isConnected) return; // 已断开，防止重复触发

            EZLog.W(EZLog.Module.Dispenser, $"Connection lost detected: {reason}");

            StopHeartbeat();
            isConnected = false;
            isReceiving = false;
            connectedDevice = null;
            ResetState();

            // 通知 UI 层更新连接状态
            OnConnectionStateChanged?.Invoke("Disconnected");
            OnBTError?.Invoke($"连接已断开: {reason}");
        }

        #endregion

        #region Device Discovery

        /// <summary>
        /// Start scanning for nearby Bluetooth devices
        /// </summary>
        public void StartDeviceDiscovery()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                if (bluetoothSerial == null)
                {
                    AndroidJavaClass unityPlayer = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
                    AndroidJavaObject activity = unityPlayer.GetStatic<AndroidJavaObject>("currentActivity");
                    bluetoothSerial = new AndroidJavaObject("com.unity.bluetooth.BluetoothSerial", activity);
                }

                bool isAvailable = bluetoothSerial.Call<bool>("isBluetoothAvailable");
                if (!isAvailable)
                {
                    EZLog.E(EZLog.Module.Dispenser, "Bluetooth not available on this device");
                    OnBTError?.Invoke("蓝牙不可用");
                    return;
                }

                bool isEnabled = bluetoothSerial.Call<bool>("isBluetoothEnabled");
                if (!isEnabled)
                {
                    EZLog.E(EZLog.Module.Dispenser, "Bluetooth is not enabled");
                    OnBTError?.Invoke("请先打开蓝牙");
                    return;
                }

                discoveredDevices.Clear();
                OnDiscoveryStarted?.Invoke();
                EZLog.I(EZLog.Module.Dispenser, "Starting device discovery");

                StartCoroutine(DiscoveryCoroutine());
            }
            catch (Exception e)
            {
                EZLog.E(EZLog.Module.Dispenser, "Discovery error", e);
                OnBTError?.Invoke($"Discovery failed: {e.Message}");
            }
#else
            StartCoroutine(WindowsSerialDiscoveryCoroutine());
#endif
        }

        private IEnumerator WindowsSerialDiscoveryCoroutine()
        {
            discoveredDevices.Clear();
            OnDiscoveryStarted?.Invoke();
            EZLog.I(EZLog.Module.Dispenser, "Starting Windows serial port discovery");

            Exception discoveryException = null;
            List<BluetoothDeviceInfo> devices = null;

            try
            {
                devices = GetOrCreateWindowsTransport().DiscoverDevices();
            }
            catch (Exception e)
            {
                discoveryException = e;
                EZLog.E(EZLog.Module.Dispenser, "Serial discovery exception", e);
            }

            yield return new WaitForSeconds(0.2f);

            if (discoveryException != null)
            {
                OnBTError?.Invoke($"搜索串口失败: {discoveryException.Message}");
                OnDiscoveryCompleted?.Invoke();
                yield break;
            }

            if (devices != null)
            {
                discoveredDevices.AddRange(devices);
            }

            OnDevicesFound?.Invoke(new List<BluetoothDeviceInfo>(discoveredDevices));
            OnDiscoveryCompleted?.Invoke();
            EZLog.I(EZLog.Module.Dispenser, $"Serial discovery completed, found {discoveredDevices.Count} ports");
        }

        /// <summary>
        /// Discovery coroutine for Android devices
        /// </summary>
        private IEnumerator DiscoveryCoroutine()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            Exception discoveryException = null;
            try
            {
                // Use the plugin API - it returns JSON format: [{"name":"DeviceName","address":"XX:XX:XX:XX:XX:XX"},...]
                string pairedDevicesJson = bluetoothSerial.Call<string>("getPairedDevices");
                EZLog.V(EZLog.Module.Protocol, $"Paired devices JSON: {pairedDevicesJson}");
                
                if (!string.IsNullOrEmpty(pairedDevicesJson) && pairedDevicesJson != "[]")
                {
                    // Parse JSON array manually (avoiding dependency on external JSON library)
                    // Format: [{"name":"DeviceName","address":"XX:XX:XX:XX:XX:XX"},...]
                    var devices = ParsePairedDevicesJson(pairedDevicesJson);
                    foreach (var device in devices)
                    {
                        discoveredDevices.Add(device);
                        EZLog.D(EZLog.Module.Dispenser, $"Found paired device: {device.DeviceName} ({device.MacAddress})");
                    }
                }

                // Notify about found devices - moved outside try block
                discoveryException = null;
            }
            catch (Exception e)
            {
                discoveryException = e;
                EZLog.E(EZLog.Module.Dispenser, "Discovery exception", e);
                OnBTError?.Invoke($"搜索异常: {e.Message}");
                OnDiscoveryCompleted?.Invoke();
            }

            // yield must be outside try-catch block
            if (discoveryException == null)
            {
                yield return new WaitForSeconds(0.5f);
                OnDevicesFound?.Invoke(new List<BluetoothDeviceInfo>(discoveredDevices));
                OnDiscoveryCompleted?.Invoke();
                EZLog.I(EZLog.Module.Dispenser, $"Discovery completed, found {discoveredDevices.Count} devices");
            }
#else
            yield break;
#endif
        }

        /// <summary>
        /// Simulate device discovery in editor mode
        /// </summary>
        private IEnumerator SimulateDiscoveryCoroutine()
        {
            yield return new WaitForSeconds(1f);

            // Simulate finding 2-3 devices
            discoveredDevices.Add(new BluetoothDeviceInfo
            {
                DeviceName = "智慧分药机",
                MacAddress = "AA:BB:CC:DD:EE:01",
                IsPaired = true,
                SignalStrength = -45
            });

            yield return new WaitForSeconds(0.5f);

            discoveredDevices.Add(new BluetoothDeviceInfo
            {
                DeviceName = "智慧分药机",
                MacAddress = "AA:BB:CC:DD:EE:02",
                IsPaired = false,
                SignalStrength = -67
            });

            yield return new WaitForSeconds(0.5f);

            discoveredDevices.Add(new BluetoothDeviceInfo
            {
                DeviceName = "Test Device",
                MacAddress = "AA:BB:CC:DD:EE:03",
                IsPaired = true,
                SignalStrength = -82
            });

            OnDevicesFound?.Invoke(new List<BluetoothDeviceInfo>(discoveredDevices));
            OnDiscoveryCompleted?.Invoke();
            EZLog.I(EZLog.Module.Dispenser, $"Editor simulation: Found {discoveredDevices.Count} devices");
        }

        /// <summary>
        /// Connect to a specific Bluetooth device by MAC address
        /// </summary>
        public void ConnectToDevice(string macAddress, string deviceName = "智慧分药机")
        {
            if (isConnected)
            {
                EZLog.W(EZLog.Module.Dispenser, "Already connected to a device, disconnect first");
                return;
            }

            deviceMacAddress = macAddress;
            OnConnectionStateChanged?.Invoke("Connecting");
            
            if (Initialize(macAddress))
            {
                connectedDevice = new BluetoothDeviceInfo
                {
                    DeviceName = deviceName,
                    MacAddress = macAddress,
                    IsPaired = true,
                    SignalStrength = -1
                };
                OnConnectionStateChanged?.Invoke("Connected");
                EZLog.I(EZLog.Module.Dispenser, $"Connected to {deviceName} ({macAddress})");
            }
            else
            {
                OnConnectionStateChanged?.Invoke("Disconnected");
                OnBTError?.Invoke("连接失败");
                EZLog.E(EZLog.Module.Dispenser, $"Failed to connect to {macAddress}");
            }
        }

        /// <summary>
        /// Disconnect from current device
        /// </summary>
        public void DisconnectCurrentDevice()
        {
            Disconnect();
            connectedDevice = null;
            OnConnectionStateChanged?.Invoke("Disconnected");
            EZLog.I(EZLog.Module.Dispenser, "Disconnected from device");
        }

        /// <summary>
        /// Get currently connected device info
        /// </summary>
        public BluetoothDeviceInfo GetConnectedDevice()
        {
            return connectedDevice;
        }

        /// <summary>
        /// Get list of discovered devices
        /// </summary>
        public List<BluetoothDeviceInfo> GetDiscoveredDevices()
        {
            return new List<BluetoothDeviceInfo>(discoveredDevices);
        }

        #endregion

        #region 数据接收

        /// <summary>
        /// 启动数据接收协程
        /// </summary>
        private void StartReceiving()
        {
            if (!isReceiving)
            {
                isReceiving = true;
                StartCoroutine(ReceiveDataCoroutine());
                EZLog.D(EZLog.Module.Protocol, "Data receiving started");
            }
        }

        /// <summary>
        /// 接收数据协程
        /// </summary>
        private IEnumerator ReceiveDataCoroutine()
        {
            while (isReceiving && isConnected)
            {
#if UNITY_ANDROID && !UNITY_EDITOR
                try
                {
                    if (bluetoothSerial != null)
                    {
                        string data = bluetoothSerial.Call<string>("read");
                        if (!string.IsNullOrEmpty(data))
                        {
                            ProcessReceivedData(data);
                        }
                    }
                }
                catch (Exception e)
                {
                    EZLog.W(EZLog.Module.Protocol, $"Receive data exception: {e.Message}");
                }
#endif
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
                try
                {
                    if (transport != null)
                    {
                        string data = transport.Read();
                        if (!string.IsNullOrEmpty(data))
                        {
                            ProcessReceivedData(data);
                        }
                    }
                }
                catch (Exception e)
                {
                    EZLog.W(EZLog.Module.Protocol, $"Serial receive data exception: {e.Message}");
                }
#endif
                yield return new WaitForSeconds(0.05f); // 20Hz 接收频率
            }
        }

        /// <summary>
        /// 处理接收到的数据
        /// </summary>
        private void ProcessReceivedData(string data)
        {
            receiveBuffer.Append(data);
            string bufferContent = receiveBuffer.ToString();

            // 按换行符分割消息
            string[] lines = bufferContent.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

            // 处理完整的行
            for (int i = 0; i < lines.Length - 1; i++)
            {
                HandleFeedbackMessage(lines[i].Trim());
            }

            // 保留最后一个不完整的行
            if (bufferContent.EndsWith("\n") || bufferContent.EndsWith("\r"))
            {
                if (lines.Length > 0)
                {
                    HandleFeedbackMessage(lines[lines.Length - 1].Trim());
                }
                receiveBuffer.Clear();
            }
            else
            {
                receiveBuffer.Clear();
                if (lines.Length > 0)
                {
                    receiveBuffer.Append(lines[lines.Length - 1]);
                }
            }
        }

        /// <summary>
        /// 处理反馈消息
        /// </summary>
        private void HandleFeedbackMessage(string message)
        {
            if (string.IsNullOrEmpty(message)) return;
            EZLog.I(EZLog.Module.Protocol, $"Received message: {message}");

            var feedback = SerialProtocol.FeedbackParser.Parse(message);
            if (feedback == null) return;

            switch (feedback.Type)
            {
                case FeedbackType.ACK:
                    ackReceived = true;
                    EZLog.D(EZLog.Module.Protocol, "ACK received");
                    break;

                case FeedbackType.DONE:
                    doneReceived = true;
                    EZLog.D(EZLog.Module.Protocol, "DONE signal received");
                    break;

                case FeedbackType.RfidUid:
                    HandleRfidUid(feedback.RfidUid);
                    break;

                case FeedbackType.RfidNoCard:
                    HandleRfidNoCard();
                    break;

                case FeedbackType.MachineInit:
                    EZLog.I(EZLog.Module.Dispenser, "Machine initialization detected");
                    OnMachineInit?.Invoke();
                    break;

                case FeedbackType.StateFinish:
                    machineState = 3;
                    EZLog.I(EZLog.Module.Dispenser, "Dispensing completed");
                    OnDispensingComplete?.Invoke();
                    break;

                case FeedbackType.MotorStalled:
                    OnMotorStalled?.Invoke(feedback.StallCode);
                    break;

                case FeedbackType.StateCountError:
                    errorCode = 2;
                    EZLog.W(EZLog.Module.Dispenser, "Count error");
                    OnCountError?.Invoke();
                    break;

                case FeedbackType.PillsOut:
                    pillRemain = totalPills - feedback.PillCount;
                    EZLog.D(EZLog.Module.Dispenser, $"Pills dispensed: {feedback.PillCount}, remaining: {pillRemain}");
                    OnPillCountUpdate?.Invoke(feedback.PillCount);
                    break;

                case FeedbackType.OptoPulseWidth:
                    EZLog.I(EZLog.Module.Dispenser, $"Lower Opto Pulse Width received: {feedback.PillCount}, seq={feedback.SequenceNumber}");
                    OnOptoPulseReceived?.Invoke(feedback.PillCount, feedback.SequenceNumber);
                    break;

                case FeedbackType.Unknown:
                    EZLog.W(EZLog.Module.Protocol, $"Unknown message: {feedback.RawMessage}");
                    break;

                case FeedbackType.CleanedPills:
                    EZLog.I(EZLog.Module.Dispenser, $"Cleaned pills: {feedback.PillCount}");
                    OnCleanCompleted?.Invoke(feedback.PillCount);
                    break;
            }
        }

        private void HandleRfidUid(string uid)
        {
            if (string.IsNullOrWhiteSpace(uid))
            {
                return;
            }

            uid = uid.Trim().ToUpperInvariant();
            if (isRfidCardPresent && string.Equals(currentRfidUid, uid, StringComparison.OrdinalIgnoreCase))
            {
                OnRfidPresenceReported?.Invoke(true, uid);
                return;
            }

            string previousUid = currentRfidUid;
            bool wasPresent = isRfidCardPresent;
            currentRfidUid = uid;
            isRfidCardPresent = true;
            OnRfidPresenceReported?.Invoke(true, uid);

            if (wasPresent && !string.IsNullOrEmpty(previousUid))
            {
                EZLog.W(EZLog.Module.Dispenser, $"RFID pill box changed: {previousUid} -> {uid}");
                OnRfidCardChanged?.Invoke(previousUid, uid);
            }
            else
            {
                EZLog.I(EZLog.Module.Dispenser, $"RFID pill box placed: {uid}");
                OnRfidCardPlaced?.Invoke(uid);
            }
        }

        private void HandleRfidNoCard()
        {
            if (!isRfidCardPresent)
            {
                OnRfidPresenceReported?.Invoke(false, null);
                return;
            }

            string removedUid = currentRfidUid;
            currentRfidUid = null;
            isRfidCardPresent = false;
            OnRfidPresenceReported?.Invoke(false, removedUid);
            EZLog.I(EZLog.Module.Dispenser, $"RFID pill box removed: {removedUid}");
            OnRfidCardRemoved?.Invoke(removedUid);
        }

        private void ClearRfidStateWithoutEvent()
        {
            currentRfidUid = null;
            isRfidCardPresent = false;
        }

        #endregion

        #region 数据发送

        /// <summary>
        /// 发送数据包（带重试机制）
        /// </summary>
        private IEnumerator SendPackageCoroutine(byte[] package, int retryCount, Action<bool> callback, bool disconnectOnFailure = true)
        {
            var logModule = disconnectOnFailure ? EZLog.Module.Protocol : EZLog.Module.Dispenser;
            if (!isConnected)
            {
                EZLog.E(logModule, "Not connected, cannot send data");
                callback?.Invoke(false);
                yield break;
            }

            if (isSendingPackage)
            {
                EZLog.W(logModule, "Previous send not finished");
                callback?.Invoke(false);
                yield break;
            }

            isSendingPackage = true;
            ackReceived = false;

            bool success = false;
            bool bytesWritten = false;

            for (int attempt = 0; attempt <= retryCount; attempt++)
            {
                if (attempt > 0)
                {
                    EZLog.D(logModule, $"Retrying send ({attempt}/{retryCount})");
                }

                // 记录发送的命令和数据
                string cmdName = package.Length > 2 ? SerialProtocol.GetCommandName(package[2]) : "EMPTY";
                string decodedInfo = DecodePackagePayload(package);
                EZLog.I(logModule, $">>> Sending to STM32: [{cmdName}]{decodedInfo} HEX: {BitConverter.ToString(package)}");

                // 发送数据
                if (!SendBytes(package))
                {
                    EZLog.E(logModule, "Send failed");
                    continue;
                }

                bytesWritten = true;
                // 等待ACK
                float waitTime = 0f;
                float currentAckTimeout = GetCurrentAckTimeout();
                while (waitTime < currentAckTimeout && !ackReceived)
                {
                    yield return new WaitForSeconds(0.01f);
                    waitTime += 0.01f;
                }

                if (ackReceived)
                {
                    EZLog.D(logModule, "Send succeeded, ACK received");
                    success = true;
                    break;
                }
            }

            if (!success)
            {
                if (disconnectOnFailure)
                {
                    EZLog.E(logModule, $"Send failed, no ACK after {retryCount} retries");
                    errorCode = 1;
                    HandleConnectionLost("发送命令无响应");
                }
                else
                {
                    // An unconfirmed clearance is not evidence that the serial connection was lost.
                    EZLog.W(logModule, bytesWritten
                        ? "解除堵转指令已写入串口，但未收到 ACK；保留连接和接收，不自动重发。"
                        : "解除堵转指令写入失败；保留接收，不自动重发，请检查设备连接。");
                }
            }

            isSendingPackage = false;
            callback?.Invoke(success);
        }

        /// <summary>
        /// 发送字节数组
        /// </summary>
        private bool SendBytes(byte[] data)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
    try
    {
        if (bluetoothSerial != null)
        {
            // 在 Java 中 byte 是有符号的，对应 C# 的 sbyte，因此我们需要将 byte[] 转换为 sbyte[]
            // 这可以消除 Unity 的 "AndroidJNIHelper: using Byte parameters is obsolete" 警告
            sbyte[] sdata = new sbyte[data.Length];
            Buffer.BlockCopy(data, 0, sdata, 0, data.Length);
            
            // 使用 writeBytes 方法（根据您的 Java 代码）
            bool success = bluetoothSerial.Call<bool>("writeBytes", sdata);
            
            if (success)
            {
                EZLog.V(EZLog.Module.Protocol, $"Sent {data.Length} bytes: [{string.Join(" ", data.Select(b => $"0x{b:X2}"))}]");
            }
            else
            {
                EZLog.E(EZLog.Module.Protocol, "writeBytes returned false");
            }
            
            return success;
        }
        else
        {
            EZLog.E(EZLog.Module.Protocol, "bluetoothSerial is null");
            return false;
        }
    }
    catch (Exception e)
    {
        EZLog.E(EZLog.Module.Protocol, "Send data exception", e);

        return false;
    }
#else
            if (transport == null)
            {
                EZLog.E(EZLog.Module.Protocol, "Serial transport is null");
                return false;
            }

            bool serialSuccess = transport.Write(data);
            if (serialSuccess)
            {
                EZLog.V(EZLog.Module.Protocol, $"Sent {data.Length} bytes: [{string.Join(" ", data.Select(b => $"0x{b:X2}"))}]");
            }
            return serialSuccess;
#endif
        }

        private float GetCurrentAckTimeout()
        {
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
            return windowsAckTimeout;
#else
            return ackTimeout;
#endif
        }

        /// <summary>
        /// 等待DONE信号
        /// </summary>
        private IEnumerator WaitForDone(float timeout, Action<bool> callback)
        {
            doneReceived = false;
            float waitTime = 0f;

            while (waitTime < timeout && !doneReceived)
            {
                yield return new WaitForSeconds(0.1f);
                waitTime += 0.1f;
            }

            callback?.Invoke(doneReceived);
        }

        /// <summary>
        /// 解码数据包负载为人类可读信息，用于日志输出
        /// 包格式: [0xAA, 0xBB, CMD, ...DATA..., CRC_L, CRC_H]
        /// </summary>
        private string DecodePackagePayload(byte[] package)
        {
            if (package == null || package.Length < 5) return "";

            byte cmd = package[2];
            // 数据区域: 跳过包头(2) + 命令(1)，去掉尾部CRC(2)
            int dataLen = package.Length - 5;

            switch (cmd)
            {
                case SerialProtocol.Commands.SET_MOTOR_SPEED:
                    if (dataLen >= 5)
                    {
                        byte deviceId = package[3];
                        string deviceName = deviceId == SerialProtocol.DeviceID.TURNTABLE_MOTOR ? "转盘电机" :
                                            deviceId == SerialProtocol.DeviceID.SERVO_MOTOR ? "舵机" :
                                            deviceId == SerialProtocol.DeviceID.CLEAR_MOTOR_STALL ? "解除2号电机堵转" :
                                            deviceId == SerialProtocol.DeviceID.CLEAR_MOTOR_3_STALL ? "解除3号电机堵转" :
                                            $"未知设备(0x{deviceId:X2})";
                        float value = BitConverter.ToSingle(package, 4);
                        return $" Device={deviceName} Value={value:F2}";
                    }
                    break;

                case SerialProtocol.Commands.SET_MOTOR_DELAY_STOP:
                    if (dataLen >= 4)
                    {
                        float delay = BitConverter.ToSingle(package, 3);
                        return $" Delay={delay:F2}";
                    }
                    break;

                case SerialProtocol.Commands.SET_CLEAN_SPEED:
                    if (dataLen >= 4)
                    {
                        float speed = BitConverter.ToSingle(package, 3);
                        return $" CleanSpeed={speed:F2}";
                    }
                    break;

                case SerialProtocol.Commands.SET_CLEAN_DELAY:
                    if (dataLen >= 4)
                    {
                        uint delayMs = BitConverter.ToUInt32(package, 3);
                        return $" CleanDelay={delayMs}ms";
                    }
                    break;

                case SerialProtocol.Commands.SEND_PILL_MATRIX:
                    if (dataLen >= 28)
                    {
                        int total = 0;
                        for (int i = 3; i < 3 + 28; i++) total += package[i];
                        return $" Pills={total}";
                    }
                    break;
            }

            return "";
        }

        #endregion

        #region 分药机控制命令

        /// <summary>
        /// 发送药片矩阵（4x7矩阵，28字节）
        /// </summary>
        public void SendPillMatrix(byte[,] matrix, Action<bool> callback = null)
        {
            if (matrix.GetLength(0) != 4 || matrix.GetLength(1) != 7)
            {
                EZLog.E(EZLog.Module.Dispenser, "Pill matrix must be 4x7");
                callback?.Invoke(false);
                return;
            }

            // 转换为字节数组（行优先）
            byte[] matrixData = new byte[28];
            for (int i = 0; i < 4; i++)
            {
                for (int j = 0; j < 7; j++)
                {
                    matrixData[i * 7 + j] = matrix[i, j];
                }
            }

            // 计算总药片数
            totalPills = 0;
            foreach (byte count in matrixData)
            {
                totalPills += count;
            }
            pillRemain = totalPills;

            EZLog.I(EZLog.Module.Dispenser, $"Sending pill matrix, total pills: {totalPills}");

            // 打印矩阵详情（4行=早中晚睡前，7列=周一到周日）
            string[] rowLabels = { "morning  ", "noon  ", "evening  ", "sleep" };
            var matrixLog = new System.Text.StringBuilder();
            matrixLog.AppendLine(">>> Pill Matrix Detail:");
            matrixLog.AppendLine("       Mon Tue Wed Thu Fri Sat Sun");
            for (int row = 0; row < 4; row++)
            {
                matrixLog.Append($"  {rowLabels[row]} ");
                for (int col = 0; col < 7; col++)
                {
                    matrixLog.Append($"  {matrix[row, col],2} ");
                }
                matrixLog.AppendLine();
            }
            matrixLog.Append($"  Total: {totalPills}");
            EZLog.I(EZLog.Module.Dispenser, matrixLog.ToString());

            byte[] package = SerialProtocol.BuildPackage(SerialProtocol.Commands.SEND_PILL_MATRIX, matrixData);
            StartCoroutine(SendPackageCoroutine(package, maxRetryCount, callback));
        }

        /// <summary>
        /// 打开舱门
        /// </summary>
        public void OpenTray(Action<bool> callback = null)
        {
            EZLog.D(EZLog.Module.Dispenser, "Opening tray");
            ClearRfidStateWithoutEvent();
            byte[] package = SerialProtocol.BuildPackage(SerialProtocol.Commands.OPEN_TRAY);
            StartCoroutine(SendPackageCoroutine(package, maxRetryCount, (success) =>
            {
                if (success) isTrayOpened = true;
                callback?.Invoke(success);
            }));
        }

        /// <summary>
        /// 关闭舱门
        /// </summary>
        public void CloseTray(Action<bool> callback = null)
        {
            EZLog.D(EZLog.Module.Dispenser, "Closing tray");
            byte[] package = SerialProtocol.BuildPackage(SerialProtocol.Commands.CLOSE_TRAY);
            StartCoroutine(SendPackageCoroutine(package, maxRetryCount, (success) =>
            {
                if (success)
                {
                    isTrayOpened = false;
                    ClearRfidStateWithoutEvent();
                }
                callback?.Invoke(success);
            }));
        }

        /// <summary>
        /// 跳过当前分药任务 — 发送 SKIP_TASK (0x00) 命令
        /// STM32 收到后会退出分药状态并打开舱门
        /// </summary>
        public void SkipTask(Action<bool> callback = null)
        {
            EZLog.I(EZLog.Module.Dispenser, "Sending SKIP_TASK command");
            byte[] package = SerialProtocol.BuildPackage(SerialProtocol.Commands.SKIP_TASK);
            StartCoroutine(SendPackageCoroutine(package, maxRetryCount, callback));
        }

        /// <summary>
        /// 清理转盘药片 — 发送 CLEAN_PILLS (0x02) 命令
        /// STM32 运行转盘直到3秒内无颗粒检测，然后返回 DONE + "cleaned pills:xx"
        /// </summary>
        public void CleanPills(Action<bool> callback = null)
        {
            EZLog.I(EZLog.Module.Dispenser, "Sending CLEAN_PILLS command");
            byte[] package = SerialProtocol.BuildPackage(SerialProtocol.Commands.CLEAN_PILLS);
            StartCoroutine(SendPackageCoroutine(package, maxRetryCount, (ackSuccess) =>
            {
                if (!ackSuccess)
                {
                    callback?.Invoke(false);
                    return;
                }

                // 等待DONE信号（清理可能需要较长时间）
                StartCoroutine(WaitForDone(30f, (doneSuccess) =>
                {
                    if (doneSuccess)
                    {
                        EZLog.I(EZLog.Module.Dispenser, "Clean pills completed");
                    }
                    else
                    {
                        EZLog.W(EZLog.Module.Dispenser, "Clean pills timed out");
                    }
                    callback?.Invoke(doneSuccess);
                }));
            }));
        }

        /// <summary>
        /// 暂停分药（通过设置电机速度为0）
        /// </summary>
        public void PauseDispenser(Action<bool> callback = null)
        {
            EZLog.D(EZLog.Module.Dispenser, "Pausing dispensing (speed=0)");
            SetTurntableSpeed(0f, (success) =>
            {
                if (success)
                {
                    isPaused = true;
                    machineState = 2;
                    OnPauseStateChanged?.Invoke(true);
                }
                callback?.Invoke(success);
            });
        }

        /// <summary>
        /// 恢复分药（通过设置电机速度为8）
        /// </summary>
        public void ResumeDispensing(Action<bool> callback = null)
        {
            EZLog.D(EZLog.Module.Dispenser, "Resuming dispensing (speed=8)");
            SetTurntableSpeed(8f, (success) =>
            {
                if (success)
                {
                    isPaused = false;
                    machineState = 1;
                    OnPauseStateChanged?.Invoke(false);
                }
                callback?.Invoke(success);
            });
        }

        /// <summary>
        /// Clears the previous dispensing pause flag when a new dispensing run starts.
        /// This only syncs software state; motor speed is configured by the dispensing flow.
        /// </summary>
        public void ResetPauseStateForNewDispensing()
        {
            if (!isPaused && machineState == 1)
            {
                return;
            }

            isPaused = false;
            machineState = 1;
            OnPauseStateChanged?.Invoke(false);
        }

        /// <summary>
        /// 复位分药机摆锤（阻塞操作，需等待DONE）
        /// </summary>
        public void ResetDispenser(Action<bool> callback = null)
        {
            EZLog.I(EZLog.Module.Dispenser, "Resetting dispenser");
            byte[] package = SerialProtocol.BuildPackage(SerialProtocol.Commands.RESET_DISPENSER);
            
            StartCoroutine(SendPackageCoroutine(package, maxRetryCount, (ackSuccess) =>
            {
                if (!ackSuccess)
                {
                    callback?.Invoke(false);
                    return;
                }

                // 等待DONE信号
                StartCoroutine(WaitForDone(resetDoneTimeout, (doneSuccess) =>
                {
                    if (doneSuccess)
                    {
                        EZLog.I(EZLog.Module.Dispenser, "Reset completed");
                    }
                    else
                    {
                        EZLog.W(EZLog.Module.Dispenser, "Reset timed out");
                    }
                    callback?.Invoke(doneSuccess);
                }));
            }));
        }

        /// <summary>
        /// 用户清理后解除堵转；仅发送一次，不自动重试。
        /// </summary>
        public void ClearMotorStall(int motorId, Action<bool> callback = null)
        {
            if (motorId != SerialProtocol.DeviceID.CLEAR_MOTOR_STALL &&
                motorId != SerialProtocol.DeviceID.CLEAR_MOTOR_3_STALL)
            {
                EZLog.W(EZLog.Module.Dispenser, $"Unsupported stalled motor: {motorId}");
                callback?.Invoke(false);
                return;
            }
            // Same device + float payload as other command 8 operations; float is ignored by firmware.
            byte[] data = new byte[5];
            data[0] = (byte)motorId;
            byte[] package = SerialProtocol.BuildPackage(SerialProtocol.Commands.SET_MOTOR_SPEED, data);
            StartCoroutine(SendPackageCoroutine(package, 0, callback, disconnectOnFailure: false));
        }

        /// <summary>设置转盘电机转速。</summary>
        public void SetTurntableSpeed(float speed, Action<bool> callback = null)
        {
            EZLog.D(EZLog.Module.Dispenser, $"Setting turntable speed: {speed}");
            byte[] data = new byte[5];
            data[0] = SerialProtocol.DeviceID.TURNTABLE_MOTOR;
            byte[] speedBytes = SerialProtocol.FloatToBytes(speed);
            Array.Copy(speedBytes, 0, data, 1, 4);

            byte[] package = SerialProtocol.BuildPackage(SerialProtocol.Commands.SET_MOTOR_SPEED, data);
            StartCoroutine(SendPackageCoroutine(package, maxRetryCount, callback));
        }

        /// <summary>
        /// 设置舵机角度（控制药物入口大小）
        /// </summary>
        public void SetServoAngle(float angle, Action<bool> callback = null)
        {
            EZLog.D(EZLog.Module.Dispenser, $"Setting servo angle: {angle}");
            byte[] data = new byte[5];
            data[0] = SerialProtocol.DeviceID.SERVO_MOTOR;
            byte[] angleBytes = SerialProtocol.FloatToBytes(angle);
            Array.Copy(angleBytes, 0, data, 1, 4);

            byte[] package = SerialProtocol.BuildPackage(SerialProtocol.Commands.SET_MOTOR_SPEED, data);
            StartCoroutine(SendPackageCoroutine(package, maxRetryCount, callback));
        }

        /// <summary>
        /// 设置清洁速度
        /// </summary>
        public void SetCleanSpeed(float speed, Action<bool> callback = null)
        {
            EZLog.D(EZLog.Module.Dispenser, $"Setting clean speed: {speed}");
            byte[] data = SerialProtocol.FloatToBytes(speed);
            byte[] package = SerialProtocol.BuildPackage(SerialProtocol.Commands.SET_CLEAN_SPEED, data);
            StartCoroutine(SendPackageCoroutine(package, maxRetryCount, callback));
        }

        /// <summary>
        /// 设置清洁延迟时间（毫秒）
        /// </summary>
        public void SetCleanDelay(uint delayMs, Action<bool> callback = null)
        {
            EZLog.D(EZLog.Module.Dispenser, $"Setting clean delay: {delayMs}ms");
            byte[] data = SerialProtocol.UInt32ToBytes(delayMs);
            byte[] package = SerialProtocol.BuildPackage(SerialProtocol.Commands.SET_CLEAN_DELAY, data);
            StartCoroutine(SendPackageCoroutine(package, maxRetryCount, callback));
        }

        #endregion

        #region 状态查询

        public bool IsConnected => isConnected;
        public bool IsTrayOpened => isTrayOpened;
        public bool IsPaused => isPaused;
        public int MachineState => machineState;
        public int ErrorCode => errorCode;
        public int PillRemain => pillRemain;
        public int TotalPills => totalPills;
        public string CurrentRfidUid => currentRfidUid;
        public bool IsRfidCardPresent => isRfidCardPresent;

        /// <summary>
        /// Attempt to reconnect if not connected (call before operations)
        /// </summary>
        public bool EnsureConnected()
        {
            if (isConnected)
            {
                return true;
            }

            EZLog.W(EZLog.Module.Dispenser, "Not connected, attempting reconnect");
            return Initialize();
        }

        #endregion

        #region 心跳检测

        /// <summary>
        /// 启动心跳检测协程
        /// </summary>
        private void StartHeartbeat()
        {
            StopHeartbeat();
            heartbeatCoroutine = StartCoroutine(HeartbeatCoroutine());
            EZLog.D(EZLog.Module.Dispenser, "Heartbeat started");
        }

        /// <summary>
        /// 停止心跳检测协程
        /// </summary>
        private void StopHeartbeat()
        {
            if (heartbeatCoroutine != null)
            {
                StopCoroutine(heartbeatCoroutine);
                heartbeatCoroutine = null;
            }
        }

        /// <summary>
        /// 心跳检测协程 - 通过写探测检测蓝牙连接是否存活
        /// 发送一个 0x00 探测字节，STM32 会丢弃（不匹配 0xAA 0xBB 包头）
        /// 若远端设备已断电，writeBytes 会触发 IOException → Java 层 closeConnection()
        /// </summary>
        private IEnumerator HeartbeatCoroutine()
        {
            // 探测数据：单个 0x00 字节，STM32 协议解析器会丢弃非 0xAA 开头的数据
            sbyte[] probeData = new sbyte[] { 0x00 };

            while (isConnected)
            {
                yield return new WaitForSeconds(HEARTBEAT_INTERVAL);

                if (!isConnected) yield break;

                // 正在发送命令时跳过探测，避免串口数据冲突
                if (isSendingPackage) continue;

#if UNITY_ANDROID && !UNITY_EDITOR
                try
                {
                    if (bluetoothSerial == null)
                    {
                        HandleConnectionLost("蓝牙对象丢失");
                        yield break;
                    }

                    // 发送探测字节：如果设备断电，Java writeBytes 会抛 IOException
                    // 并调用 closeConnection()，使 isConnected() 返回 false
                    bool writeOk = bluetoothSerial.Call<bool>("writeBytes", probeData);

                    if (!writeOk)
                    {
                        // 写入失败，确认连接状态
                        bool stillConnected = bluetoothSerial.Call<bool>("isConnected");
                        if (!stillConnected)
                        {
                            EZLog.W(EZLog.Module.Dispenser, "Heartbeat: write probe failed, device disconnected");
                            HandleConnectionLost("设备已断开连接");
                            yield break;
                        }
                    }
                }
                catch (Exception e)
                {
                    EZLog.W(EZLog.Module.Dispenser, $"Heartbeat exception: {e.Message}");
                    HandleConnectionLost("心跳检测异常");
                    yield break;
                }
#endif
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
                if (transport == null || !transport.IsConnected)
                {
                    HandleConnectionLost("串口连接已断开");
                    yield break;
                }
#endif
            }
        }

        #endregion

        #region Unity生命周期

        private void OnDestroy()
        {
            Disconnect();
        }

        private void OnApplicationQuit()
        {
            Disconnect();
        }

        #endregion

        #region JSON Parsing

        /// <summary>
        /// Parse paired devices JSON string from the Bluetooth plugin
        /// Format: [{"name":"DeviceName","address":"XX:XX:XX:XX:XX:XX"},...]
        /// </summary>
        private List<BluetoothDeviceInfo> ParsePairedDevicesJson(string json)
        {
            var devices = new List<BluetoothDeviceInfo>();
            
            if (string.IsNullOrEmpty(json) || json == "[]")
            {
                return devices;
            }

            try
            {
                // Remove the outer brackets
                json = json.Trim();
                if (json.StartsWith("[")) json = json.Substring(1);
                if (json.EndsWith("]")) json = json.Substring(0, json.Length - 1);
                
                // Split by },{ to get individual device objects
                string[] deviceStrings = json.Split(new string[] { "},{" }, StringSplitOptions.RemoveEmptyEntries);
                
                foreach (string deviceStr in deviceStrings)
                {
                    string cleanDeviceStr = deviceStr.Trim();
                    // Clean up the braces
                    if (cleanDeviceStr.StartsWith("{")) cleanDeviceStr = cleanDeviceStr.Substring(1);
                    if (cleanDeviceStr.EndsWith("}")) cleanDeviceStr = cleanDeviceStr.Substring(0, cleanDeviceStr.Length - 1);
                    
                    // Parse name and address
                    string name = ExtractJsonValue(cleanDeviceStr, "name");
                    string address = ExtractJsonValue(cleanDeviceStr, "address");
                    
                    if (!string.IsNullOrEmpty(address))
                    {
                        devices.Add(new BluetoothDeviceInfo
                        {
                            DeviceName = string.IsNullOrEmpty(name) ? "智慧分药机" : name,
                            MacAddress = address,
                            IsPaired = true,
                            SignalStrength = -1
                        });
                    }
                }
            }
            catch (Exception e)
            {
                EZLog.E(EZLog.Module.Dispenser, "Failed to parse paired devices JSON", e);
            }
            
            return devices;
        }

        /// <summary>
        /// Extract a string value from a simple JSON object
        /// </summary>
        private string ExtractJsonValue(string json, string key)
        {
            string searchKey = "\"" + key + "\":\"";
            int startIndex = json.IndexOf(searchKey);
            if (startIndex == -1) return "";
            
            startIndex += searchKey.Length;
            int endIndex = json.IndexOf("\"", startIndex);
            if (endIndex == -1) return "";
            
            return json.Substring(startIndex, endIndex - startIndex);
        }

        #endregion
    }
}
