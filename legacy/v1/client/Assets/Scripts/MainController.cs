using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Threading;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
using EZDose.Prescriptions;
using EZDose.Hardware;
using EZDose.Calibration;

namespace EZDose.MainFlow
{
    /// <summary>
    /// Central coordinator for the dispensing flow.
    /// Keeps track of patients, builds dispensing plans, and drives the hardware.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public class MainController : MonoBehaviour
    {
        public static MainController Instance { get; private set; }

        // Dispensing settings are now read from AppConfig for consistency
        // and to allow runtime configuration via the settings UI
        private int maxDispensingDays => AppConfig.Instance.MaxDispensingDays;
        private int expiryDaysThreshold => AppConfig.Instance.ExpiryDaysThreshold;

        [Header("Auto Refresh")]
        [Tooltip("Enable automatic refresh of patient list from server.")]
        [SerializeField] private bool enableAutoRefresh = true;

        [Tooltip("Interval in seconds between automatic refreshes. Recommended: 30-60 seconds.")]
        [SerializeField] private float autoRefreshInterval = 30f;

        [Tooltip("Minimum interval allowed (in seconds) to prevent server overload.")]
        [SerializeField] private float minRefreshInterval = 10f;

        [Header("Hardware")]
        [SerializeField] private DispenserController dispenserController;
        [SerializeField] private PillCalibrationManager calibrationManager;

        [Tooltip("开舱后等待机械出舱/到位完成的延迟时间（秒）。可在 Unity Inspector 面板中调整。")]
        [SerializeField] private float trayMovementDelaySeconds = 2.0f;

        // Patient list updates
        public event Action<List<PatientStatus>> PatientsUpdated;
        
        // Progress events for UI binding
        public event Action<DispensingProgressInfo> DispensingProgressChanged;
        public event Action<string> DispensingError;
        public event Action DispensingCompleted;
        public event Action<float> ServoAngleChanged;       // 舵机角度改变事件
        public event Action<int> PlateSwitchRequired;
        public event Action<string> DeviceLost;
        public event Action<bool> MotorStallChanged;
        public bool IsMotorStalled { get; private set; }
        public int CurrentStalledMotor { get; private set; }
        private readonly Dictionary<int, int> pendingMotorStalls = new Dictionary<int, int>();
        private int motorStallRevision;
        private bool clearingMotorStall;
        
        // Event to trigger the manual error resolution dialog in UI
        public event Action<string> ErrorResolutionRequired;
        
        // Skip medicine event - triggered when UI requests to skip current medicine
        public event Action<string> MedicineSkipped;                      // Medicine name that was skipped
        
        // Skip confirm event - triggered when skip command sent, UI shows confirmation dialog
        public event Action<string> SkipConfirmRequired;                  // Medicine name being skipped

        private PrescriptionManager prescriptionManager;
        private readonly Dictionary<string, PatientStatus> patientStatus = new Dictionary<string, PatientStatus>(StringComparer.OrdinalIgnoreCase);

        // Threshold in days before medicine expiry to trigger dispensing
        // Medicines expiring within this many days will be flagged for dispensing
        

        private PatientStatus currentPatient;
        private DispensingPlan currentPlan;
        private bool currentPillBoxUsesRfid;

        /// <summary>
        /// 公开当前的分药计划，供 UI 层检测分盘组成
        /// </summary>
        public DispensingPlan CurrentPlan => currentPlan;
        public bool CurrentPillBoxUsesRfid => currentPillBoxUsesRfid;

        private bool isDispensing;
        private bool isDeviceLostAbort;
        private bool hasPendingDeviceLost;
        private TaskCompletionSource<bool> dispenseTcs;
        private TaskCompletionSource<bool> plateReadyTcs;

        // Flag to indicate we're actively waiting for a pill matrix dispensing to complete
        // This prevents false completion triggers from configuration command responses
        private bool isWaitingForDispensingComplete;
        
        // Flag to tracking if the current dispensing failure was due to a specific count error
        private bool hasCountError;
        
        // Task for waiting for user to confirm manual error resolution
        private TaskCompletionSource<bool> errorResolutionTcs;
        
        // Task for handling skip request during dispensing
        private TaskCompletionSource<bool> skipCurrentMedicineTcs;
        
        // Task for waiting for user to confirm skip in dialog
        private TaskCompletionSource<bool> skipConfirmTcs;

        private string currentMedicineName = string.Empty;
        private string currentMedicineImageResourceId = string.Empty;
        private float currentMotorSpeed = 0f;
        private float currentServoAngle = 0f;
        private int medicineServoSession;
        private string currentMedicineDosageSpec = string.Empty;
        private float lastSetServoAngle = 0.8f;     // 记录最近一次配置的舵机角度
        private int currentPlate = 1;
        private int currentMedicineTotal = 0;
        private readonly List<int> optoPulseWidths = new List<int>();
        private readonly List<PulseRecordSample> currentMedicinePulseSamples = new List<PulseRecordSample>();
        private float medicineStartRealtime = 0f;
        private float lastPulseRealtime = 0f;
        private int validPulseCount = 0;  // Count of valid pulse widths (3-200) for progress tracking (legacy fallback)
        private int lastReceivedSequenceNumber = -1;  // Last received sequence number for duplicate detection
        
        // Valid pulse width range for counting pills (min 3 to capture small pills, max 200 to exclude long jams)
        private const int MIN_VALID_PULSE_WIDTH = 3;
        private const int MAX_VALID_PULSE_WIDTH = 200;
        private const int MOTOR_RECONFIGURE_STOP_DELAY_MS = 100;
        
        // Next medicine info for UI preview (set during dispensing)
        private string nextMedicineName = string.Empty;
        private int nextMedicinePillCount = 0;

        // Auto-refresh coroutine reference for cleanup
        private Coroutine autoRefreshCoroutine;

        // Flag to pause auto-refresh during active dispensing
        private bool isAutoRefreshPaused;

        #if UNITY_STANDALONE_WIN && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();
        #endif

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);

            #if UNITY_STANDALONE_WIN && !UNITY_EDITOR
            try
            {
                SetProcessDPIAware();
                EZLog.I(EZLog.Module.UI, "Successfully set process DPI awareness via Win32 API");
            }
            catch (Exception e)
            {
                EZLog.W(EZLog.Module.UI, "Failed to set process DPI awareness: " + e.Message);
            }

            AdaptWindowResolution();
            #endif

            // Register scene load callback to automatically enforce UI scaling across scenes (All platforms: Windows, Android, Editor)
            SceneManager.sceneLoaded += OnSceneLoaded;
            ConfigureAllCanvasScalers();
        }

        #if UNITY_STANDALONE_WIN && !UNITY_EDITOR
        /// <summary>
        /// 根据用户显示器的实际分辨率，动态调整窗口尺寸，确保与设计时的比例保持一致。
        /// </summary>
        private void AdaptWindowResolution()
        {
            try
            {
                // 1. 获取当前显示器的实际物理高度
                int screenWidth = Screen.currentResolution.width;
                int screenHeight = Screen.currentResolution.height;

                // 2. 计算缩放系数（以 1440p 下的 0.6 倍缩放为基准）
                float scaleFactor = 0.6f * ((float)screenHeight / 1440f);

                // 3. 计算目标窗口大小
                int targetWidth = Mathf.RoundToInt(2800f * scaleFactor);
                int targetHeight = Mathf.RoundToInt(1840f * scaleFactor);

                // 4. 安全保护：确保窗口大小不会超出屏幕物理范围
                targetWidth = Mathf.Clamp(targetWidth, 800, screenWidth);
                targetHeight = Mathf.Clamp(targetHeight, 525, screenHeight);

                // 5. 设置窗口化模式并应用计算好的分辨率
                Screen.SetResolution(targetWidth, targetHeight, FullScreenMode.Windowed);

                EZLog.I(EZLog.Module.UI, $"Window adapted. Screen: {screenWidth}x{screenHeight}, ScaleFactor: {scaleFactor:F3}, Target Window: {targetWidth}x{targetHeight}");
            }
            catch (Exception e)
            {
                EZLog.E(EZLog.Module.UI, "Failed to adapt window resolution", e);
            }
        }
        #endif

        private void OnSceneLoaded(Scene scene, LoadSceneMode mode)
        {
            ConfigureAllCanvasScalers();
        }

        private void ConfigureAllCanvasScalers()
        {
            try
            {
                // 寻找场景中所有的 CanvasScaler 组件（包含未激活的）
                CanvasScaler[] scalers = FindObjectsByType<CanvasScaler>(FindObjectsInactive.Include, FindObjectsSortMode.None);
                foreach (CanvasScaler scaler in scalers)
                {
                    if (scaler != null)
                    {
                        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
                        scaler.referenceResolution = new Vector2(2800f, 1840f);
                        scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
                        scaler.matchWidthOrHeight = 0.5f;
                        // 提高动态字体的渲染分辨率倍数，防止位图字体在缩放窗口下发虚
                        scaler.dynamicPixelsPerUnit = 3f;
                        EZLog.I(EZLog.Module.UI, $"Configured CanvasScaler on GameObject '{scaler.gameObject.name}' to ScaleWithScreenSize (2800x1840, DPPU=3)");
                    }
                }
            }
            catch (Exception e)
            {
                EZLog.E(EZLog.Module.UI, "Failed to configure CanvasScalers", e);
            }
        }

        private void Start()
        {
            prescriptionManager = new PrescriptionManager(AppConfig.Instance.ServerUrl);

            if (dispenserController == null)
            {
                dispenserController = FindObjectOfType<DispenserController>();
            }

            BindDispenserEvents(true);
            // ConnectDispenser();

            FireAndForget(RefreshPatientsAsync());
            // Start automatic refresh if enabled
            StartAutoRefresh();
        }

        private PillCalibrationManager GetCalibrationManager()
        {
            if (PillCalibrationManager.Instance != null)
            {
                return PillCalibrationManager.Instance;
            }

            if (calibrationManager != null)
            {
                return calibrationManager;
            }

            calibrationManager = FindObjectOfType<PillCalibrationManager>();
            return calibrationManager;
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Instance = null;
            }
            BindDispenserEvents(false);

            // Stop auto-refresh coroutine to prevent memory leaks
            StopAutoRefresh();

            // Unregister scene load callback (All platforms)
            SceneManager.sceneLoaded -= OnSceneLoaded;
        }

        private void BindDispenserEvents(bool subscribe)
        {
            if (dispenserController == null)
            {
                return;
            }

            if (subscribe)
            {
                dispenserController.OnDispensingComplete += OnMachineDispensingComplete;
                dispenserController.OnCountError += OnMachineCountError;
                dispenserController.OnMotorStalled += OnMachineMotorStalled;
                // Progress bar now driven by OnOptoPulseReceived instead of OnPillCountUpdate
                // to reduce bluetooth message count
                dispenserController.OnOptoPulseReceived += OnMachineOptoPulseReceived;
                dispenserController.OnBTError += OnDispenserDeviceLost;
            }
            else
            {
                dispenserController.OnDispensingComplete -= OnMachineDispensingComplete;
                dispenserController.OnCountError -= OnMachineCountError;
                dispenserController.OnMotorStalled -= OnMachineMotorStalled;
                dispenserController.OnOptoPulseReceived -= OnMachineOptoPulseReceived;
                dispenserController.OnBTError -= OnDispenserDeviceLost;
            }
        }

        // /// <summary>
        // /// Try to connect to the dispenser as soon as the app opens.
        // /// </summary>
        // private void ConnectDispenser()
        // {
        //     if (dispenserController == null)
        //     {
        //         Debug.LogWarning("[MainController] DispenserController is missing in the scene");
        //         return;
        //     }

        //     var ok = dispenserController.Initialize();
        //     if (!ok)
        //     {
        //         Debug.LogWarning("[MainController] Failed to initialize dispenser. Will retry on next command.");
        //     }
        // }

        #region 从服务器轮询处方信息

        /// <summary>
        /// Starts the automatic refresh coroutine if enabled.
        /// The coroutine periodically fetches patient data from the server.
        /// </summary>
        public void StartAutoRefresh()
        {
            // Stop any existing coroutine before starting a new one
            StopAutoRefresh();

            if (!enableAutoRefresh)
            {
                EZLog.D(EZLog.Module.Main, "Auto-refresh is disabled in settings");
                return;
            }

            // Ensure interval is not below minimum to prevent server overload
            var interval = Mathf.Max(autoRefreshInterval, minRefreshInterval);
            autoRefreshCoroutine = StartCoroutine(AutoRefreshCoroutine(interval));
            EZLog.I(EZLog.Module.Main, $"Auto-refresh started with interval: {interval} seconds");
        }

        /// <summary>
        /// Stops the automatic refresh coroutine if running.
        /// Call this when leaving the Home scene or when manual control is needed.
        /// </summary>
        public void StopAutoRefresh()
        {
            if (autoRefreshCoroutine != null)
            {
                StopCoroutine(autoRefreshCoroutine);
                autoRefreshCoroutine = null;
                EZLog.D(EZLog.Module.Main, "Auto-refresh stopped");
            }
        }

        /// <summary>
        /// Temporarily pauses auto-refresh during active dispensing operations.
        /// This prevents interference during critical hardware communication.
        /// </summary>
        public void PauseAutoRefresh()
        {
            isAutoRefreshPaused = true;
            EZLog.D(EZLog.Module.Main, "Auto-refresh paused");
        }

        /// <summary>
        /// Resumes auto-refresh after dispensing operations complete.
        /// </summary>
        public void ResumeAutoRefresh()
        {
            isAutoRefreshPaused = false;
            EZLog.D(EZLog.Module.Main, "Auto-refresh resumed");
        }

        /// <summary>
        /// Sets whether auto-refresh is enabled and restarts the coroutine if needed.
        /// </summary>
        /// <param name="enabled">True to enable auto-refresh, false to disable.</param>
        public void SetAutoRefreshEnabled(bool enabled)
        {
            enableAutoRefresh = enabled;

            if (enabled)
            {
                StartAutoRefresh();
            }
            else
            {
                StopAutoRefresh();
            }
        }

        
        /// <summary>
        /// Updates the auto-refresh interval and restarts the coroutine with the new timing.
        /// </summary>
        /// <param name="intervalSeconds">New interval in seconds (will be clamped to minimum).</param>
        public void SetAutoRefreshInterval(float intervalSeconds)
        {
            autoRefreshInterval = Mathf.Max(intervalSeconds, minRefreshInterval);

            // Restart coroutine with new interval if currently running
            if (enableAutoRefresh && autoRefreshCoroutine != null)
            {
                StartAutoRefresh();
            }
        }

        /// <summary>
        /// Coroutine that periodically refreshes patient data from the server.
        /// Automatically skips refresh cycles during active dispensing.
        /// </summary>
        /// <param name="intervalSeconds">Time between refresh attempts.</param>
        private System.Collections.IEnumerator AutoRefreshCoroutine(float intervalSeconds)
        {
            // Wait for first interval before starting (initial refresh is done in Start)
            yield return new WaitForSeconds(intervalSeconds);

            while (true)
            {
                // Skip refresh if paused (during dispensing) or if already dispensing
                if (!isAutoRefreshPaused && !isDispensing)
                {
                    EZLog.D(EZLog.Module.Main, "Auto-refresh: Fetching patient data from server");
                    FireAndForget(RefreshPatientsAsync());
                }
                else
                {
                    EZLog.V(EZLog.Module.Main, "Auto-refresh: Skipped (dispensing in progress or paused)");
                }

                yield return new WaitForSeconds(intervalSeconds);
            }
        }

        /// <summary>
        /// Refresh patient list from the server.
        /// Only includes patients who need dispensing today (medicines expiring within threshold).
        /// </summary>
        public async Task RefreshPatientsAsync(bool keepCompleted = true)
        {
            if (prescriptionManager == null)
            {
                return;
            }

            var success = await prescriptionManager.RefreshFromServerAsync();
            if (!success)
            {
                EZLog.W(EZLog.Module.Main, "Failed to pull patients from server");
            }

            EZLog.I(EZLog.Module.Main, $"Received {prescriptionManager.CachedRecords.Count} prescription records from server");
            foreach (var rx in prescriptionManager.CachedRecords)
            {
                EZLog.V(EZLog.Module.Main, $"RX: patient_id={rx.patient_id}, patient_name={rx.patient_name}, medicine_name={rx.medicine_name}, last_dispensed_expiry_date={rx.last_dispensed_expiry_date}, is_active={rx.is_active}");
            }

            patientStatus.Clear();

            // Group prescription records by patient_id to get unique patients
            var grouped = prescriptionManager.CachedRecords
                .GroupBy(r => r.patient_id)
                .Select(g => new PatientInfo
                {
                    PatientId = g.Key,
                    PatientName = g.First().patient_name,
                    BedNumber = g.First().bed_number
                })
                .OrderBy(p => p.PatientName);

            int addedCount = 0;
            foreach (var patient in grouped)
            {
                // Count how many medicines need dispensing today
                var medicineCount = CountMedicinesNeedingDispensing(patient.PatientId, expiryDaysThreshold);
                EZLog.D(EZLog.Module.Main, $"Patient {patient.PatientId} ({patient.PatientName}) needs dispensing for {medicineCount} medicines");

                // Only include patients who have medicines needing dispensing today
                if (medicineCount > 0)
                {
                    patientStatus[patient.PatientId] = new PatientStatus(patient, false, medicineCount);
                    addedCount++;
                }
            }

            EZLog.I(EZLog.Module.Main, $"Added {addedCount} patients needing dispensing to UI");
            PatientsUpdated?.Invoke(GetPatientsSnapshot());
        }

        /// <summary>
        /// Count how many medicines need dispensing today for a patient.
        /// A medicine needs dispensing if:
        /// 1. last_dispensed_expiry_date is empty/null (never dispensed), OR
        /// 2. last_dispensed_expiry_date is within threshold days from today
        /// </summary>
        private int CountMedicinesNeedingDispensing(string patientId, int thresholdDays)
        {
            if (prescriptionManager == null)
            {
                return 0;
            }

            if (!prescriptionManager.TryGetPatientPrescription(patientId, out var prescription))
            {
                return 0;
            }

            if (prescription.Medicines == null || prescription.Medicines.Count == 0)
            {
                return 0;
            }

            var today = DateTime.Today;
            int count = 0;

            foreach (var medicine in prescription.Medicines)
            {
                if (!medicine.IsActive)
                {
                    continue;
                }

                // Parse StartDate first as it's required for both new and old medicines
                if (!DateTime.TryParse(medicine.StartDate, out var startDate))
                {
                    count++; // Data error, assume needs dispensing to be safe
                    continue;
                }

                DateTime expiryDate;
                if (string.IsNullOrWhiteSpace(medicine.LastDispensedExpiryDate))
                {
                    // [NEW] For new medicines, treat "last expiry" as the day before start date
                    expiryDate = startDate.Date.AddDays(-1);
                }
                else if (!DateTime.TryParse(medicine.LastDispensedExpiryDate, out expiryDate))
                {
                    count++; // Parse error on existing expiry, assume needs dispensing
                    continue;
                }

                // Remaining prescription days = (StartDate + Duration) - Today
                var endOfPrescription = startDate.Date.AddDays(medicine.DurationDays);
                var remainingNeeded = (endOfPrescription - today).Days;
                
                // Days of pills currently held = LastDispensedExpiryDate - Today
                var daysUntilExpiry = (expiryDate.Date - today).Days + 1;

                // If we already have enough pills to last until the end of the prescription, skip
                // Or if the prescription period has already passed (remainingNeeded <= 0)
                if (daysUntilExpiry >= remainingNeeded || remainingNeeded <= 0)
                {
                    continue;
                }

                // Check if pills are running low (within threshold)
                // New medicines (expiry = startDate - 1) will typically trigger this if startDate is soon
                if (daysUntilExpiry <= thresholdDays)
                {
                    count++;
                }
            }

            return count;
        }

        /// <summary>
        /// Check if a patient needs dispensing today.
        /// A patient needs dispensing if any active medicine expires within the threshold days.
        /// Matches Python's get_patients_for_today logic: days_until_expiry <= threshold.
        /// </summary>
        private bool CheckIfPatientNeedsDispensingToday(string patientId, int thresholdDays)
        {
            if (prescriptionManager == null)
            {
                return false;
            }

            // Try to get patient prescription data
            if (!prescriptionManager.TryGetPatientPrescription(patientId, out var prescription))
            {
                return false;
            }

            // If patient has no medicines, they don't need dispensing
            if (prescription.Medicines == null || prescription.Medicines.Count == 0)
            {
                return false;
            }

            var today = DateTime.Today;

            // Check if any active medicine expires within threshold
            foreach (var medicine in prescription.Medicines)
            {
                if (!medicine.IsActive)
                {
                    continue; // Skip inactive medicines
                }

                // Parse StartDate first
                if (!DateTime.TryParse(medicine.StartDate, out var startDate))
                {
                    return true; // Data error, assume needs dispensing
                }

                DateTime expiryDate;
                if (string.IsNullOrWhiteSpace(medicine.LastDispensedExpiryDate))
                {
                    // [NEW] For new medicines, treat "last expiry" as the day before start date
                    expiryDate = startDate.Date.AddDays(-1);
                }
                else if (!DateTime.TryParse(medicine.LastDispensedExpiryDate, out expiryDate))
                {
                    return true; // Parse error on existing expiry
                }

                // [NEW] Check if we already have enough pills to cover the rest of the prescription
                var endOfPrescription = startDate.Date.AddDays(medicine.DurationDays);
                var remainingNeeded = (endOfPrescription - today).Days;
                var daysUntilExpiry = (expiryDate.Date - today).Days + 1;

                // Skip if held pills >= remaining needed, or if prescription is already over
                if (daysUntilExpiry >= remainingNeeded || remainingNeeded <= 0)
                {
                    continue;
                }

                // If medicine expires within threshold, patient needs dispensing
                if (daysUntilExpiry <= thresholdDays)
                {
                    return true;
                }
            }

            // No medicines expiring within threshold
            return false;
        }

        /// <summary>
        /// Expose a snapshot to UI without sharing internal references.
        /// </summary>
        public List<PatientStatus> GetPatients()
        {
            return GetPatientsSnapshot();
        }

        private List<PatientStatus> GetPatientsSnapshot()
        {
            return patientStatus.Values
                .OrderBy(p => p.PatientName)
                .Select(p => p.Clone())
                .ToList();
        }

        /// <summary>
        /// Set the current patient before scanning and dispensing.
        /// </summary>
        public bool TrySelectPatient(string patientId, out PatientStatus status)
        {
            status = null;
            if (string.IsNullOrWhiteSpace(patientId))
            {
                return false;
            }

            if (!patientStatus.TryGetValue(patientId, out var record))
            {
                return false;
            }

            currentPatient = record;
            currentPillBoxUsesRfid = false;
            status = record;
            return true;
        }

        public void SetCurrentPillBoxUsesRfid(bool usesRfid)
        {
            currentPillBoxUsesRfid = usesRfid;
        }

        public bool TryResolvePatientIdByRfidUid(string uid, out string patientId)
        {
            patientId = null;
            return prescriptionManager != null &&
                   prescriptionManager.TryGetPatientIdByRfidUid(uid, out patientId);
        }

        public PatientStatus GetCurrentPatient()
        {
            return currentPatient;
        }

        /// <summary>
        /// Clear the current patient selection.
        /// </summary>
        public void ClearCurrentPatient()
        {
            currentPatient = null;
            currentPillBoxUsesRfid = false;
        }

        /// <summary>
        /// Build a dispensing plan for the selected patient.
        /// </summary>
        public Task<bool> PreparePlanAsync()
        {
            if (currentPatient == null)
            {
                DispensingError?.Invoke("尚未选择患者");
                return Task.FromResult(false);
            }

            if (!prescriptionManager.TryGenerateDispensingPlan(currentPatient.PatientId, maxDispensingDays, expiryDaysThreshold, out var plan))
            {
                DispensingError?.Invoke("无法生成分药计划，请检查处方数据");
                return Task.FromResult(false);
            }

            currentPlan = plan;
            return Task.FromResult(true);
        }


        #region 分药过程逻辑，包含换盘和错误处理逻辑
        /// <summary>
        /// Start the dispensing routine. This runs plate by plate.
        /// </summary>
        public async Task<bool> StartDispensingAsync()
        {
            if (isDispensing)
            {
                return false;
            }

            if (dispenserController == null)
            {
                DispensingError?.Invoke("分药机未连接");
                return false;
            }

            if (currentPlan == null)
            {
                var ok = await PreparePlanAsync();
                if (!ok)
                {
                    return false;
                }
            }

            isDeviceLostAbort = false;
            isDispensing = true;
            dispenserController.ResetPauseStateForNewDispensing();

            // Build a flat list of all medicines with their plate numbers for easier indexing
            var allMedicines = new List<(DispensingMedicine med, int plate)>();
            if (currentPlan.MedicinesPlate1 != null)
            {
                foreach (var med in currentPlan.MedicinesPlate1)
                    allMedicines.Add((med, 1));
            }
            if (currentPlan.MedicinesPlate2 != null)
            {
                foreach (var med in currentPlan.MedicinesPlate2)
                    allMedicines.Add((med, 2));
            }

            int currentPlate1Count = currentPlan.MedicinesPlate1?.Count ?? 0;

            for (int i = 0; i < allMedicines.Count; i++)
            {
                if (isDeviceLostAbort)
                {
                    return FinishDeviceLostAbort();
                }

                var (med, plate) = allMedicines[i];
                
                // Determine next medicine info (if any)
                DispensingMedicine nextMed = null;
                if (i + 1 < allMedicines.Count)
                {
                    nextMed = allMedicines[i + 1].med;
                }

                // Handle plate switch if moving from plate 1 to plate 2
                if (plate == 2 && i == currentPlate1Count && currentPlate1Count > 0)
                {
                    // Open tray so user can remove old plate
                    var openTcs = new TaskCompletionSource<bool>();
                    dispenserController.OpenTray(success => openTcs.TrySetResult(success));
                    var opened = await openTcs.Task;
                    if (!opened || isDeviceLostAbort)
                    {
                        return FinishDeviceLostAbort();
                    }
                    
                    // Ask the user to swap the plate before continuing.
                    PlateSwitchRequired?.Invoke(plate);
                    plateReadyTcs = new TaskCompletionSource<bool>();
                    var plateReady = await plateReadyTcs.Task;
                    if (!plateReady || isDeviceLostAbort)
                    {
                        return FinishDeviceLostAbort();
                    }
                    
                    // Close tray after new plate is inserted
                    var closeTcs = new TaskCompletionSource<bool>();
                    dispenserController.CloseTray(success => closeTcs.TrySetResult(success));
                    var closed = await closeTcs.Task;
                    if (!closed || isDeviceLostAbort)
                    {
                        return FinishDeviceLostAbort();
                    }
                }

                var ok = await DispenseMedicineAsync(med, plate, nextMed);
                if (!ok)
                {
                    if (isDeviceLostAbort)
                    {
                        return FinishDeviceLostAbort();
                    }

                    isDispensing = false;
                    return false;
                }
            }

                // All medicines dispensed successfully
                
                EZLog.I(EZLog.Module.Main, "Opening tray for pill collection");
                var trayOpened = await OpenTrayAsync();
                if (!trayOpened || isDeviceLostAbort)
                {
                    return FinishDeviceLostAbort();
                }

                EZLog.D(EZLog.Module.Main, $"Waiting for tray mechanical movement to complete ({trayMovementDelaySeconds}s)...");
                await Task.Delay(TimeSpan.FromSeconds(Mathf.Max(0f, trayMovementDelaySeconds))); 
                if (isDeviceLostAbort)
                {
                    return FinishDeviceLostAbort();
                }

                EZLog.I(EZLog.Module.Main, "All medicines dispensed, pausing turntable motor");
                var paused = await PauseAsync();
                if (!paused || isDeviceLostAbort)
                {
                    return FinishDeviceLostAbort();
                }

                EZLog.I(EZLog.Module.Main, "Setting servo to 1.0f upon completion");
                await RunDispenserAction(callback => dispenserController.SetServoAngle(1.0f, callback));
                lastSetServoAngle = 1.0f;
                ServoAngleChanged?.Invoke(1.0f);

                // Update server and mark patient complete
            await prescriptionManager.PushAllChangesAsync();
            MarkPatientCompleted(currentPatient.PatientId);

            isDispensing = false;
            
            // Fire completion event
            DispensingCompleted?.Invoke();
            return true;
        }

        /// <summary>
        /// Called by UI after the user has replaced the plate for plate 2.
        /// </summary>
        public void ConfirmPlateReady()
        {
            plateReadyTcs?.TrySetResult(true);
        }

        /// <summary>
        /// Called by UI when user confirms they have fixed the count error.
        /// </summary>
        public void ConfirmErrorResolution()
        {
            errorResolutionTcs?.TrySetResult(true);
        }

        private void OnDispenserDeviceLost(string reason)
        {
            const string disconnectedPrefix = "连接已断开:";
            if (string.IsNullOrEmpty(reason) || !reason.StartsWith(disconnectedPrefix, StringComparison.Ordinal))
            {
                EZLog.W(EZLog.Module.Main, $"Ignoring non-disconnect Bluetooth error: {reason}");
                return;
            }

            EZLog.W(EZLog.Module.Main, $"Device lost: {reason}");

            isDeviceLostAbort = true;
            AbortCurrentDispensing();

            if (hasPendingDeviceLost)
            {
                return;
            }

            hasPendingDeviceLost = true;
            DeviceLost?.Invoke(reason);
        }

        private void AbortCurrentDispensing()
        {
            SetMotorStalled(false);
            isDispensing = false;
            isWaitingForDispensingComplete = false;
            hasCountError = false;

            dispenseTcs?.TrySetResult(false);
            plateReadyTcs?.TrySetResult(false);
            errorResolutionTcs?.TrySetResult(false);
            skipConfirmTcs?.TrySetResult(false);
        }

        private bool FinishDeviceLostAbort()
        {
            EZLog.W(EZLog.Module.Main, "Dispensing aborted because device was lost");
            isDispensing = false;
            currentPlan = null;
            return false;
        }

        public async Task ResetAfterDeviceLostAsync()
        {
            AbortCurrentDispensing();
            currentPlan = null;
            currentPatient = null;
            currentPillBoxUsesRfid = false;
            currentMedicineName = string.Empty;
            currentMedicineImageResourceId = string.Empty;
            currentMotorSpeed = 0f;
            currentServoAngle = 0f;
            currentMedicineDosageSpec = string.Empty;
            currentMedicineTotal = 0;
            nextMedicineName = string.Empty;
            nextMedicinePillCount = 0;
            optoPulseWidths.Clear();
            validPulseCount = 0;
            lastReceivedSequenceNumber = -1;
            ResumeAutoRefresh();

            if (dispenserController != null)
            {
                dispenserController.Disconnect();
            }

            prescriptionManager = new PrescriptionManager(AppConfig.Instance.ServerUrl);
            await RefreshPatientsAsync(false);
            hasPendingDeviceLost = false;
        }

        private async Task<bool> DispenseMedicineAsync(DispensingMedicine med, int plate, DispensingMedicine nextMed = null)
        {
            if (med == null)
            {
                return false;
            }
            
            SetMotorStalled(false);
            medicineServoSession++;

            // Store next medicine info for UI preview
            if (nextMed != null)
            {
                nextMedicineName = nextMed.MedicineName;
                nextMedicinePillCount = CountPillsFromMatrix(nextMed.PillMatrix);
            }
            else
            {
                nextMedicineName = string.Empty;
                nextMedicinePillCount = 0;
            }

            // Configure dispenser hardware based on motor speed and servo angle
            var calibrationMgr = GetCalibrationManager();
            var (speed, angle) = calibrationMgr != null
                ? calibrationMgr.GetSettingsOrDefault(med.MotorSpeed, med.ServoAngle)
                : (0.3f, 0.8f);

            EZLog.D(EZLog.Module.Main, $"Configuring dispenser for '{med.MedicineName}': speed={speed:.2f}, angle={angle:.2f}");
            var configured = await ConfigureDispenser(speed, angle);
            if (isDeviceLostAbort)
            {
                return false;
            }

            if (!configured)
            {
                EZLog.W(EZLog.Module.Main, $"Failed to configure dispenser for '{med.MedicineName}', continuing anyway");
            }

            var matrix = ToByteMatrix(med.PillMatrix);
            currentMedicineTotal = CountPills(matrix);
            currentMedicineName = med.MedicineName;
            currentMedicineImageResourceId = med.ImageResourceId ?? string.Empty;
            currentMotorSpeed = speed;
            currentServoAngle = angle;
            currentMedicineDosageSpec = med.DosageSpec ?? string.Empty;
            currentPlate = plate;

            var progress = new DispensingProgressInfo
            {
                PatientName = currentPatient?.PatientName ?? string.Empty,
                MedicineName = currentMedicineName,
                PlateNumber = plate,
                TotalPills = currentMedicineTotal,
                DispensedPills = 0,
                Progress = 0f,
                ImageResourceId = med.ImageResourceId,
                NextMedicineName = nextMedicineName,
                NextMedicinePillCount = nextMedicinePillCount,
                CurrentMotorSpeed = currentMotorSpeed,
                CurrentServoAngle = currentServoAngle,
                DosageSpec = currentMedicineDosageSpec
            };
            DispensingProgressChanged?.Invoke(progress);

            // Reset error flag before starting
            hasCountError = false;
            
            // Reset opto pulse width collection for this medicine
            optoPulseWidths.Clear();
            currentMedicinePulseSamples.Clear();
            medicineStartRealtime = Time.realtimeSinceStartup;
            lastPulseRealtime = 0f;
            validPulseCount = 0;  // Reset valid pulse counter for progress tracking
            lastReceivedSequenceNumber = -1;  // Reset sequence number tracking
            
            // Reset skip task for this medicine
            skipCurrentMedicineTcs = new TaskCompletionSource<bool>();

            var (success, wasSkipped, markAsDispensed) = await SendMatrixAndWaitAsync(matrix);
            if (isDeviceLostAbort)
            {
                return false;
            }
            
            // Record pulse data to CSV regardless of outcome
            string dispenseResult = wasSkipped ? "SKIPPED" : (hasCountError ? "CNT_ERR" : (success ? "SUCCESS" : "FAILED"));
            PulseDataRecorder.RecordSession(
                currentPatient?.PatientId ?? string.Empty,
                currentPatient?.PatientName ?? string.Empty,
                med.PrescriptionId,
                med.MedicineName,
                plate,
                currentMedicineTotal,
                speed,
                angle,
                dispenseResult,
                currentMedicinePulseSamples);
            
            // If skipped by user
            if (wasSkipped)
            {
                EZLog.I(EZLog.Module.Main, $"Medicine '{med.MedicineName}' was skipped by user, markAsDispensed={markAsDispensed}");
                if (markAsDispensed)
                {
                    prescriptionManager.ApplyDispensingResult(
                        med.PrescriptionId,
                        med.MedicineName,
                        med.DispensingDays);
                }
                return true;  // Return true to continue the loop
            }
            
            // If failed specifically due to count error, initiate interactive recovery
            if (!success && hasCountError)
            {
                EZLog.W(EZLog.Module.Main, $"Count error detected for {med.MedicineName}, initiating recovery flow");
                
                // 1. Eject tray for user access
                await OpenTrayAsync();
                
                // 2. Request user intervention via UI
                ErrorResolutionRequired?.Invoke($"药物 {med.MedicineName} 分发计数错误。\n请手动核对药盘图案，完成后点击确认。");
                
                // 3. Wait for user confirmation (ConfirmErrorResolution called by UI)
                errorResolutionTcs = new TaskCompletionSource<bool>();
                var resolved = await errorResolutionTcs.Task;
                if (!resolved || isDeviceLostAbort)
                {
                    return false;
                }
                
                // Note: We intentionally do NOT close the tray here.
                // - For single medicine: tray stays open until user confirms completion dialog
                // - For multiple medicines: hardware handles next medicine with tray open (via pill matrix)
                
                // 4. Treat as success (manual fix) and continue
                EZLog.I(EZLog.Module.Main, "Error resolution confirmed by user, continuing dispensing");
                prescriptionManager.ApplyDispensingResult(
                    med.PrescriptionId,
                    med.MedicineName,
                    med.DispensingDays);
                return true; 
            }
            
            if (success)
            {
                prescriptionManager.ApplyDispensingResult(
                    med.PrescriptionId,
                    med.MedicineName,
                    med.DispensingDays);
                
                // Save average opto pulse width converted to motor speed and servo angle to server
                await SavePulseWidthSettingsAsync(med);
            }

            return success;
        }
        
        /// <summary>
        /// Called by UI to skip the current medicine and proceed to the next one.
        /// The skipped medicine will be marked as not dispensed.
        /// </summary>
        public void SkipCurrentMedicine()
        {
            if (!isDispensing)
            {
                EZLog.W(EZLog.Module.Main, "SkipCurrentMedicine called but not currently dispensing");
                return;
            }
            
            EZLog.I(EZLog.Module.Main, $"Skipping medicine: {currentMedicineName}");
            
            // Cancel any pending dispensing operation
            isWaitingForDispensingComplete = false;
            skipCurrentMedicineTcs?.TrySetResult(true);
        }

        /// <summary>
        /// Called by UI when user confirms skip in the dialog.
        /// </summary>
        /// <param name="markAsDispensed">If true, the skipped medicine will be marked as dispensed</param>
        public void ConfirmSkipReady(bool markAsDispensed)
        {
            EZLog.D(EZLog.Module.Main, $"Skip confirmed, markAsDispensed={markAsDispensed}");
            skipConfirmTcs?.TrySetResult(markAsDispensed);
        }

        /// <summary>
        /// Configure dispenser motor speed and servo angle directly.
        /// </summary>
        private async Task<bool> ConfigureDispenser(float motorSpeed, float servoAngle)
        {
            if (dispenserController == null)
            {
                return false;
            }

            EZLog.D(EZLog.Module.Main, $"Configuring dispenser settings: motor={motorSpeed:.2f}, servo={servoAngle:.2f}");

            // CRITICAL: Temporarily unsubscribe from completion event during configuration
            // Configuration commands also send machine_state:FINISH which should NOT trigger dispensing completion
            dispenserController.OnDispensingComplete -= OnMachineDispensingComplete;

            try
            {
                EZLog.D(EZLog.Module.Main, $"Setting motor speed: {motorSpeed}, servo angle: {servoAngle}");

                // Set servo angle for the new pill size.
                var angleResult = await RunDispenserAction(callback =>
                    dispenserController.SetServoAngle(servoAngle, callback));

                if (!angleResult)
                {
                    EZLog.W(EZLog.Module.Main, "Failed to set servo angle");
                    return false;
                }

                lastSetServoAngle = servoAngle;
                ServoAngleChanged?.Invoke(servoAngle);

                // Set turntable speed to the calculated speed for this medicine.
                var speedResult = await RunDispenserAction(callback =>
                    dispenserController.SetTurntableSpeed(motorSpeed, callback));

                if (!speedResult)
                {
                    EZLog.W(EZLog.Module.Main, "Failed to set motor speed");
                    return false;
                }
                
                EZLog.I(EZLog.Module.Main, "Dispenser configuration completed successfully");
                return true;
            }
            finally
            {
                // Re-subscribe to completion event after configuration is done
                dispenserController.OnDispensingComplete += OnMachineDispensingComplete;
            }
        }
        #endregion

        private static int CountPills(byte[,] matrix)
        {
            var total = 0;
            foreach (var value in matrix)
            {
                total += value;
            }
            return total;
        }
        
        /// <summary>
        /// Count pills from int[,] matrix (used for next medicine preview)
        /// </summary>
        private static int CountPillsFromMatrix(int[,] matrix)
        {
            if (matrix == null) return 0;
            var total = 0;
            foreach (var value in matrix)
            {
                total += value;
            }
            return total;
        }

        private byte[,] ToByteMatrix(int[,] source)
        {
            var result = new byte[4, 7];
            if (source == null)
            {
                return result;
            }

            for (int i = 0; i < 4; i++)
            {
                for (int j = 0; j < 7; j++)
                {
                    var value = source[i, j];
                    result[i, j] = (byte)Mathf.Clamp(value, 0, byte.MaxValue);
                }
            }

            return result;
        }

        private async Task<(bool success, bool wasSkipped, bool markAsDispensed)> SendMatrixAndWaitAsync(byte[,] matrix)
        {
            if (isDeviceLostAbort)
            {
                return (false, false, false);
            }

            // Create a fresh TaskCompletionSource for this specific dispensing operation
            // This ensures we only respond to FINISH messages for THIS matrix send
            dispenseTcs = new TaskCompletionSource<bool>();
            
            // CRITICAL: Reset the waiting flag before sending
            // This prevents stale FINISH messages from completing the wrong operation
            isWaitingForDispensingComplete = false;

            var sendTcs = new TaskCompletionSource<bool>();
            dispenserController.SendPillMatrix(matrix, success =>
            {
                sendTcs.TrySetResult(success);
            });

            // Wait for send confirmation
            var sendSuccess = await sendTcs.Task;
            if (!sendSuccess)
            {
                EZLog.W(EZLog.Module.Main, "Failed to send pill matrix");
                return (false, false, false);
            }
            if (isDeviceLostAbort)
            {
                return (false, false, false);
            }

            // Only start waiting for completion AFTER the matrix is successfully sent
            // This prevents configuration command FINISH responses from triggering completion
            isWaitingForDispensingComplete = true;
            EZLog.I(EZLog.Module.Main, "Matrix sent successfully, now waiting for dispensing completion or skip");

            // Wait for either: dispensing complete OR skip requested
            var dispensingTask = dispenseTcs.Task;
            var skipTask = skipCurrentMedicineTcs.Task;
            Task timeoutTask;
            Task completedTask;
            using (var timeoutCancellation = new CancellationTokenSource())
            {
                timeoutTask = WaitForDispensingTimeoutAsync(timeoutCancellation.Token);
                completedTask = await Task.WhenAny(dispensingTask, skipTask, timeoutTask);
                timeoutCancellation.Cancel();
            }
            SetMotorStalled(false);
            
            if (completedTask == skipTask)
            {
                // User requested skip - send SKIP_TASK command to STM32
                EZLog.I(EZLog.Module.Main, "Skip requested, sending SKIP_TASK command");
                isWaitingForDispensingComplete = false;
                
                var skipCmdTcs = new TaskCompletionSource<bool>();
                dispenserController.SkipTask(s => skipCmdTcs.TrySetResult(s));
                bool skipSuccess = await skipCmdTcs.Task;
                
                if (!skipSuccess)
                {
                    EZLog.E(EZLog.Module.Main, "SKIP_TASK command failed, no ACK from dispenser");
                    DispensingError?.Invoke("跳过命令发送失败，请重试");
                    // Reset skip TCS so user can try again
                    skipCurrentMedicineTcs = new TaskCompletionSource<bool>();
                    isWaitingForDispensingComplete = true;
                    // Re-enter the wait loop by recursing
                    return await SendMatrixAndWaitAsync(matrix);
                }
                
                // STM32 acknowledged skip — notify UI to show confirmation dialog
                SkipConfirmRequired?.Invoke(currentMedicineName);
                MedicineSkipped?.Invoke(currentMedicineName);
                
                // Wait for user to confirm in dialog
                skipConfirmTcs = new TaskCompletionSource<bool>();
                bool markAsDispensed = await skipConfirmTcs.Task;
                if (isDeviceLostAbort)
                {
                    return (false, false, false);
                }
                
                // No need to CloseTray here — SendPillMatrix for the next medicine
                // will automatically move the tray to the correct row
                return (false, true, markAsDispensed);
            }
            
            if (completedTask == timeoutTask)
            {
                DispensingError?.Invoke("分药超时，请检查设备连接");
                isWaitingForDispensingComplete = false;
                return (false, false, false);
            }
            
            // Dispensing completed normally
            return (await dispensingTask, false, false);
        }
        #endregion

        private async Task WaitForDispensingTimeoutAsync(CancellationToken cancellationToken)
        {
            float remaining = 600f;
            float previous = Time.realtimeSinceStartup;
            while (remaining > 0f)
            {
                bool wasStalled = IsMotorStalled;
                await Task.Delay(100, cancellationToken);
                float now = Time.realtimeSinceStartup;
                if (!wasStalled && !IsMotorStalled) remaining -= now - previous;
                previous = now;
            }
        }

        private void SetMotorStalled(bool stalled)
        {
            if (!stalled)
            {
                pendingMotorStalls.Clear();
                CurrentStalledMotor = 0;
            }
            if (IsMotorStalled == stalled) return;
            IsMotorStalled = stalled;
            MotorStallChanged?.Invoke(stalled);
        }

        private void OnMachineMotorStalled(int code)
        {
            if (!isWaitingForDispensingComplete) return;
            if (code != SerialProtocol.DeviceID.CLEAR_MOTOR_STALL &&
                code != SerialProtocol.DeviceID.CLEAR_MOTOR_3_STALL)
            {
                EZLog.W(EZLog.Module.Dispenser, $"Unsupported stalled motor: {code}");
                return;
            }
            pendingMotorStalls[code] = ++motorStallRevision;
            EZLog.W(EZLog.Module.Dispenser, $"Motor stalled: {code}; waiting for manual clearance");
            if (IsMotorStalled) return;
            CurrentStalledMotor = code;
            SetMotorStalled(true);
        }

        public async Task<bool> ClearMotorStallAsync()
        {
            if (!IsMotorStalled || !isWaitingForDispensingComplete || clearingMotorStall ||
                dispenserController == null || !dispenserController.IsConnected) return false;

            int session = medicineServoSession;
            int motorId = CurrentStalledMotor;
            int revision = pendingMotorStalls[motorId];
            clearingMotorStall = true;
            try
            {
                var completion = new TaskCompletionSource<bool>();
                dispenserController.ClearMotorStall(motorId, success => completion.TrySetResult(success));
                bool acknowledged = await completion.Task;
                if (!acknowledged || session != medicineServoSession ||
                    !pendingMotorStalls.TryGetValue(motorId, out int latestRevision) || revision != latestRevision ||
                    !isWaitingForDispensingComplete || isDeviceLostAbort) return false;

                // Only clear the acknowledged motor; another motor may still require user action.
                pendingMotorStalls.Remove(motorId);
                if (pendingMotorStalls.Count > 0)
                {
                    CurrentStalledMotor = pendingMotorStalls.Keys.First();
                    MotorStallChanged?.Invoke(true);
                }
                else
                {
                    // ACK confirms receipt only. Continue waiting for the existing task's feedback.
                    SetMotorStalled(false);
                }
                return true;
            }
            finally
            {
                clearingMotorStall = false;
            }
        }

        private async Task<bool> WaitWithTimeout(Task<bool> task, TimeSpan timeout)
        {
            var delay = Task.Delay(timeout);
            var finished = await Task.WhenAny(task, delay);

            if (finished == delay)
            {
                DispensingError?.Invoke("分药超时，请检查设备连接");
                return false;
            }

            return await task;
        }

        private void OnMachineDispensingComplete()
        {
            // Only respond to FINISH messages if we're actively waiting for dispensing completion
            // This prevents false triggers from configuration commands or stale messages
            if (!isWaitingForDispensingComplete)
            {
                EZLog.V(EZLog.Module.Main, "Ignoring FINISH message - not waiting for dispensing completion");
                return;
            }

            EZLog.I(EZLog.Module.Main, "Dispensing complete for current medicine");
            isWaitingForDispensingComplete = false;
            dispenseTcs?.TrySetResult(true);
        }

        private void OnMachineCountError()
        {
            // Only respond to error messages if we're actively waiting for dispensing completion
            if (!isWaitingForDispensingComplete)
            {
                EZLog.V(EZLog.Module.Main, "Ignoring count error - not waiting for dispensing completion");
                return;
            }

            EZLog.W(EZLog.Module.Main, "Machine reported count error");
            hasCountError = true;
            isWaitingForDispensingComplete = false;
            dispenseTcs?.TrySetResult(false);
            
            // Note: We do NOT trigger DispensingError event here anymore.
            // The recovery logic in DispenseMedicineAsync will handle the UI prompt.
        }

        // OnMachinePillCountUpdate removed - progress bar now driven by OnMachineOptoPulseReceived
        // to reduce bluetooth message count (reuses lowerOpt pulse width data stream)

        /// <summary>
        /// Collect opto pulse widths during dispensing (STM32 handles auto-speed).
        /// Uses hardware-reported sequence number for progress tracking when available.
        /// Falls back to client-side valid pulse counting for legacy format.
        /// </summary>
        private void OnMachineOptoPulseReceived(int pulseWidth, int sequenceNumber)
        {
            // Only process pulses if we are actively waiting for dispensing to complete.
            // This prevents stray pulses (from noise or delayed bluetooth messages) from corrupting the new medicine counting.
            if (!isWaitingForDispensingComplete)
            {
                EZLog.V(EZLog.Module.Main, $"Ignoring extra opto pulse because not in active dispensing state: width={pulseWidth}, seq={sequenceNumber}");
                return;
            }

            // Duplicate detection using sequence number
            if (sequenceNumber >= 0 && sequenceNumber <= lastReceivedSequenceNumber)
            {
                EZLog.W(EZLog.Module.Main, $"Ignoring duplicate/out-of-order pulse: seq={sequenceNumber} (last={lastReceivedSequenceNumber})");
                return;
            }

            // Update last received sequence number
            if (sequenceNumber >= 0)
            {
                lastReceivedSequenceNumber = sequenceNumber;
            }

            // Calculate time offset and interval for dataset collection
            float nowRealtime = Time.realtimeSinceStartup;
            long timeOffsetMs = (long)((nowRealtime - medicineStartRealtime) * 1000f);
            long pulseIntervalMs = lastPulseRealtime > 0f ? (long)((nowRealtime - lastPulseRealtime) * 1000f) : timeOffsetMs;
            lastPulseRealtime = nowRealtime;

            bool isValidPulse = pulseWidth >= MIN_VALID_PULSE_WIDTH && pulseWidth <= MAX_VALID_PULSE_WIDTH;

            currentMedicinePulseSamples.Add(new PulseRecordSample
            {
                SequenceNumber = sequenceNumber >= 0 ? sequenceNumber : (currentMedicinePulseSamples.Count + 1),
                PulseWidth = pulseWidth,
                TimeOffsetMs = timeOffsetMs,
                PulseIntervalMs = pulseIntervalMs,
                UsedMotorSpeed = currentMotorSpeed,
                UsedServoAngle = lastSetServoAngle,
                IsValid = isValidPulse
            });

            // Filter out anomalous pulse widths to prevent skewing the pill area estimation
            if (isValidPulse)
            {
                optoPulseWidths.Add(pulseWidth);
            }
            else
            {
                EZLog.D(EZLog.Module.Main, $"Opto pulse width {pulseWidth} out of valid range ({MIN_VALID_PULSE_WIDTH}-{MAX_VALID_PULSE_WIDTH}), excluded from average calculation.");
            }

            EZLog.D(EZLog.Module.Main, $"Opto pulse width seq={sequenceNumber}: {pulseWidth}");
            
            // Determine dispensed pill count for progress:
            // - If sequence number available (new format): use it directly as the pill count
            // - If legacy format (sequenceNumber == -1): fall back to client-side counting of valid pulses
            int dispensedCount;

            if (sequenceNumber >= 0)
            {
                // New format: sequence number IS the dispensed pill count (1-based from STM32)
                dispensedCount = sequenceNumber;
                EZLog.D(EZLog.Module.Main, $"Using hardware sequence number for progress: {dispensedCount}/{currentMedicineTotal}");
            }
            else
            {
                // Legacy format: count valid pulse widths client-side
                if (isValidPulse)
                {
                    validPulseCount++;
                    EZLog.D(EZLog.Module.Main, $"Valid pill detected (pulse={pulseWidth}), count={validPulseCount}/{currentMedicineTotal}");
                }
                else
                {
                    EZLog.D(EZLog.Module.Main, $"Ignoring out-of-range pulse width {pulseWidth} (valid range: {MIN_VALID_PULSE_WIDTH}-{MAX_VALID_PULSE_WIDTH})");
                    return;  // Don't update progress for invalid pulses in legacy mode
                }
                dispensedCount = validPulseCount;
            }

            // Clamp progress to [0, 1] to prevent UI overflow
            float progressValue = currentMedicineTotal > 0
                ? Mathf.Clamp01((float)dispensedCount / currentMedicineTotal)
                : 0f;

            // Update progress bar
            var progress = new DispensingProgressInfo
            {
                PatientName = currentPatient?.PatientName ?? string.Empty,
                MedicineName = currentMedicineName,
                PlateNumber = currentPlate,
                TotalPills = currentMedicineTotal,
                DispensedPills = dispensedCount,
                Progress = progressValue,
                ImageResourceId = currentMedicineImageResourceId,
                NextMedicineName = nextMedicineName,
                NextMedicinePillCount = nextMedicinePillCount,
                CurrentMotorSpeed = currentMotorSpeed,
                CurrentServoAngle = currentServoAngle,
                DosageSpec = currentMedicineDosageSpec
            };
            
            DispensingProgressChanged?.Invoke(progress);
        }

        /// <summary>
        /// After dispensing completes, compute median pulse width, convert to motor speed and servo angle,
        /// and save to server for future dispensing of this medicine.
        /// </summary>
        private async Task SavePulseWidthSettingsAsync(Prescriptions.DispensingMedicine med)
        {
            var calibrationMgr = GetCalibrationManager();
            int minSamples = calibrationMgr != null ? calibrationMgr.MinSamplesForOptimization : 7;

            // 样本数门槛：如果本次分药收集的脉冲少于设定门槛（如小于7粒），不进行参数优化
            if (optoPulseWidths.Count < minSamples)
            {
                EZLog.I(EZLog.Module.Main, $"Collected pulse samples ({optoPulseWidths.Count}) is less than minimum required threshold ({minSamples}). Skipping pulse optimization for '{med?.MedicineName}'.");
                return;
            }

            // Calculate median pulse width (robust against noise, dust, and outliers)
            var sortedPulses = optoPulseWidths.OrderBy(x => x).ToList();
            int count = sortedPulses.Count;
            float medianPulseWidth = (count % 2 == 0)
                ? (sortedPulses[count / 2 - 1] + sortedPulses[count / 2]) / 2f
                : sortedPulses[count / 2];

            EZLog.I(EZLog.Module.Main, $"Median opto pulse width: {medianPulseWidth:F2} (from {count} samples, range: [{sortedPulses[0]}, {sortedPulses[count - 1]}])");

            if (calibrationMgr == null)
            {
                EZLog.W(EZLog.Module.Main, "No calibration manager found, cannot compute settings from pulse width");
                return;
            }

            // Only calculate and save new settings if dynamic pulse optimization is enabled!
            if (!calibrationMgr.EnablePulseOptimization)
            {
                EZLog.I(EZLog.Module.Main, $"Dynamic pulse optimization is disabled on PillCalibrationManager. Skipping settings update to server for '{med.MedicineName}'.");
                return;
            }

            var (newSpeed, newAngle) = calibrationMgr.CalculateSettingsFromPulseWidth(medianPulseWidth);
            EZLog.I(EZLog.Module.Main, $"Calculated settings from median pulse ({medianPulseWidth:F2}): motor={newSpeed:F2}, servo={newAngle:F2}");

            // Update current medicine settings for UI display
            currentMotorSpeed = newSpeed;
            currentServoAngle = newAngle;
            if (med != null)
            {
                med.MotorSpeed = newSpeed;
                med.ServoAngle = newAngle;
                prescriptionManager?.UpdateDispenserSettingsLocally(med.PrescriptionId, med.MedicineName, newSpeed, newAngle);
            }

            // Save to server for future use
            if (med != null && med.PrescriptionId > 0)
            {
                bool updated = await calibrationMgr.UpdateDispenserSettingsOnServerAsync(med.PrescriptionId, newSpeed, newAngle);
                if (updated)
                {
                    EZLog.I(EZLog.Module.Main, $"Saved settings motor={newSpeed:F2}, servo={newAngle:F2} to server for '{med.MedicineName}'");
                }
                else
                {
                    EZLog.W(EZLog.Module.Main, $"Failed to save dispenser settings to server for '{med.MedicineName}'");
                }
            }
        }

        public Task<bool> OpenTrayAsync()
        {
            if (dispenserController == null || !dispenserController.EnsureConnected())
            {
                EZLog.E(EZLog.Module.Main, "Cannot open tray - dispenser not connected");
                return Task.FromResult(false);
            }

            return RunDispenserAction(dispenserController.OpenTray);
        }

        public Task<bool> CloseTrayAsync()
        {
            if (dispenserController == null || !dispenserController.EnsureConnected())
            {
                EZLog.E(EZLog.Module.Main, "Cannot close tray - dispenser not connected");
                return Task.FromResult(false);
            }

            return RunDispenserAction(dispenserController.CloseTray);
        }

        public Task<bool> CleanTurntableAsync()
        {
            if (dispenserController == null || !dispenserController.IsConnected)
            {
                EZLog.E(EZLog.Module.Main, "Cannot clean turntable - dispenser not connected");
                return Task.FromResult(false);
            }

            return RunDispenserAction(dispenserController.CleanPills, TimeSpan.FromSeconds(35));
        }

        public Task<bool> PauseAsync()
        {
            if (dispenserController == null)
            {
                return Task.FromResult(false);
            }

            return RunDispenserAction(dispenserController.PauseDispenser);
        }

        private Task<bool> RunDispenserAction(Action<Action<bool>> action, TimeSpan? timeout = null)
        {
            var tcs = new TaskCompletionSource<bool>();

            if (action == null)
            {
                tcs.TrySetResult(false);
                return tcs.Task;
            }

            action(success =>
            {
                tcs.TrySetResult(success);
            });

            return WaitWithTimeout(tcs.Task, timeout ?? TimeSpan.FromSeconds(10));
        }

        /// <summary>
        /// 同步更新最后一次设置的舵机角度值（用于平滑过渡起始值）
        /// </summary>
        public void UpdateLastSetServoAngle(float angle)
        {
            lastSetServoAngle = angle;
        }

        private void MarkPatientCompleted(string patientId)
        {
            if (string.IsNullOrWhiteSpace(patientId))
            {
                return;
            }

            // Remove patient from list entirely (button will disappear)
            // Patient no longer needs dispensing today since all medicines are dispensed
            if (patientStatus.ContainsKey(patientId))
            {
                patientStatus.Remove(patientId);
                EZLog.I(EZLog.Module.Main, $"Patient {patientId} completed and removed from today's list");
                
                // Notify UI to update patient list (button will be removed)
                PatientsUpdated?.Invoke(GetPatientsSnapshot());
            }
        }

        /// <summary>
        /// Helper to run async work from non-async Unity callbacks.
        /// </summary>
        private void FireAndForget(Task task)
        {
            async void Wrapper()
            {
                try
                {
                    await task;
                }
                catch (Exception e)
                {
                    EZLog.E(EZLog.Module.Main, $"Async error: {e.Message}");
                }
            }

            Wrapper();
        }
    }

    [Serializable]
    public class PatientStatus
    {
        // Patient identification and dispensing status
        // Note: RFID removed - patients identified by 6-digit ID only
        public string PatientName;
        public string PatientId;        // 6-digit zero-padded format (e.g., "000001")
        public string BedNumber;
        public bool IsCompleted;        // Whether dispensing is done for this patient
        public int MedicineCount;       // Number of medicines needing dispensing

        public PatientStatus() { }

        public PatientStatus(PatientInfo info, bool completed, int medicineCount = 0)
        {
            PatientName = info.PatientName;
            PatientId = info.PatientId;
            BedNumber = info.BedNumber;
            IsCompleted = completed;
            MedicineCount = medicineCount;
        }

        /// <summary>
        /// Create a deep copy to avoid sharing references with UI.
        /// </summary>
        public PatientStatus Clone()
        {
            return new PatientStatus
            {
                PatientName = PatientName,
                PatientId = PatientId,
                BedNumber = BedNumber,
                IsCompleted = IsCompleted,
                MedicineCount = MedicineCount
            };
        }
    }

    [Serializable]
    public class DispensingProgressInfo
    {
        public string PatientName;
        public string MedicineName;
        public int PlateNumber;
        public int TotalPills;
        public int DispensedPills;
        public float Progress;
        public string ImageResourceId;  // Pill image filename for display
        
        // Next medicine info for user preview
        public string NextMedicineName;    // Name of the next medicine to dispense (empty if this is the last one)
        public int NextMedicinePillCount;  // Total pills for the next medicine
        
        // Current pill tuning settings
        public float CurrentMotorSpeed;
        public float CurrentServoAngle;
        public string DosageSpec;          // 剂量规格
    }
}
