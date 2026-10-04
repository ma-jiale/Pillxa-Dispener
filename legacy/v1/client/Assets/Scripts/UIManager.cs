using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using EZDose.MainFlow;
using EZDose.CheckPillBox;
using EZDose.PillCounter;
using EZDose.Hardware;
using EZDose.Calibration;
using UnityEngine.EventSystems;
using EZDose;
using EZDose.Prescriptions;

namespace EZDose.UI
{
    /// <summary>
    /// Defines the available sub-pages on the right panel of the Home screen.
    /// Add new page types here when extending the UI.
    /// </summary>
    public enum HomeSubPage
    {
        PatientCard = 0,  // Default page showing patient card information
        CountPills = 1,   // Page for counting pills / dispensing overview
        Setting = 2       // Settings page for app configuration
    }

    /// <summary>
    /// Handles UI binding, scene transitions, and simple user prompts.
    /// Also manages Home page sub-page switching (stacked pages on the right panel).
    /// </summary>
    public class UIManager : MonoBehaviour
    {
        [Header("Scene Names")]
        [SerializeField] private string homeSceneName = "Home";
        [SerializeField] private string scanSceneName = "Scan";
        [SerializeField] private string dispenseSceneName = "Dispense";

        [Header("Home UI")]
        [SerializeField] private Transform patientListRoot;
        [SerializeField] private GameObject patientButtonPrefab;
        [SerializeField] private Button refreshButton;
        [SerializeField] private Text homeHintText;

        [Header("Device Management")]
        [Tooltip("Button to open device management dialog")]
        [SerializeField] private Button manageDevicesButton;
        [Tooltip("Button to clean pills from the turntable")]
        [SerializeField] private Button cleanTurntableButton;

        [Header("Device Button Visuals")]
        [SerializeField] private Image connectedIcon;
        [SerializeField] private Image disconnectedIcon;
        [SerializeField] private Text manageDevicesButtonText;
        
        [Tooltip("Reference to DeviceManagerUI component")]
        [SerializeField] private DeviceManagerUI deviceManagerUI;

        [Header("Dispenser Connection Check")]
        [Tooltip("Dialog shown when clicking patient card and dispenser is not connected")]
        [SerializeField] private GameObject connectDispenserDialog;
        [Tooltip("Confirm button in the connection required dialog")]
        [SerializeField] private Button connectDialogConfirmButton;

        [Header("Device Lost Dialog")]
        [Tooltip("Dialog shown when the dispenser becomes unreachable during scan or dispensing")]
        [SerializeField] private GameObject deviceLostDialog;
        [Tooltip("Confirm button in the device lost dialog")]
        [SerializeField] private Button deviceLostConfirmButton;
        [Tooltip("Optional message text in the device lost dialog")]
        [SerializeField] private Text deviceLostMessageText;

        [Header("Home Sub-Pages (Right Panel)")]
        [Tooltip("Reference to the PatientCard sub-page container. This page shows patient information.")]
        [SerializeField] private GameObject patientCardPage;

        [Tooltip("Reference to the CountPills sub-page container. This page handles pill counting display.")]
        [SerializeField] private GameObject countPillsPage;

        [Tooltip("Reference to the Setting sub-page container. This page provides app settings.")]
        [SerializeField] private GameObject settingPage;

        [Header("Home Sub-Page Navigation Buttons")]
        [Tooltip("Button that switches to the PatientCard page when clicked.")]
        [SerializeField] private Button patientCardButton;

        [Tooltip("Button that switches to the CountPills page when clicked.")]
        [SerializeField] private Button countPillsButton;

        [Tooltip("Button that switches to the Setting page when clicked.")]
        [SerializeField] private Button settingButton;

        [Header("Home Sub-Page Configuration")]
        [Tooltip("The sub-page to display when the Home scene first loads.")]
        [SerializeField] private HomeSubPage defaultSubPage = HomeSubPage.PatientCard;

        [Tooltip("Color applied to the active navigation button to indicate the current page.")]
        [SerializeField] private Color activeButtonColor = new Color(0.2f, 0.6f, 1f, 1f);

        [Tooltip("Color applied to inactive navigation buttons.")]
        [SerializeField] private Color inactiveButtonColor = Color.white;

        [Tooltip("Enable/disable visual highlighting on active navigation button.")]
        [SerializeField] private bool useButtonHighlight = true;

        [Header("Scan UI")]
        [SerializeField] private Button backToHomeButton;
        [SerializeField] private RectTransform lightBar;
        [SerializeField] private float lightBarSpeed = 200f;
        [SerializeField] private CheckPillBoxController scanner;
        [SerializeField] private GameObject correctBoxDialog;
        [SerializeField] private Button correctDialogConfirmButton;
        [Tooltip("扫码成功提示文本组件，留空则自动查找")]
        [SerializeField] private Text correctBoxDialogText;
        [SerializeField] private GameObject mismatchDialog;
        [SerializeField] private Button mismatchHomeButton;
        [SerializeField] private Button mismatchRetryButton;

        [Header("Home Scan Dialog")]
        [Tooltip("New dedicated dialog for scan verification and confirmation in the Home scene")]
        [SerializeField] private GameObject homeScanDialog;
        [SerializeField] private Text homeScanDialogTitleText;
        [SerializeField] private Text homeScanDialogMessageText;
        [SerializeField] private Button homeScanConfirmButton;
        [SerializeField] private Button homeScanCancelButton;
        [SerializeField] private Button homeScanSwitchCameraButton;
        [SerializeField] private Text homeScanSwitchCameraButtonText;
        [SerializeField] private GameObject homeScanInsertIcon;
        [SerializeField] private Text homeScanPrescriptionDetailsText;

        [Header("Home Auto Scan Button")]
        [Tooltip("Button to insert tray and start automatic patient recognition in the Home scene")]
        [SerializeField] private Button autoScanButton;

        [Tooltip("Button to switch camera")]
        [SerializeField] private Button switchCameraButton;
        [Tooltip("Text for camera switch button")]
        [SerializeField] private Text switchCameraButtonText;

        [Header("Dispense UI")]
        [SerializeField] private Text totalPillsText;
        [SerializeField] private Text medicineNameText;
        [SerializeField] private Text patientNameText;
        [SerializeField] private Text progressPercentText;
        [Tooltip("展示当前分发药品剂量规格的文本框")]
        [SerializeField] private Text dosageSpecText;
        [Tooltip("Progress fill image, should use Image Type Filled")]
        [SerializeField] private Image progressFillImage;
        [SerializeField] private RawImage pillPreview;
        [SerializeField] private Button captureBackgroundButton;
        [SerializeField] private GameObject plateSwitchDialog;
        [SerializeField] private Button plateSwitchConfirmButton;
        [Tooltip("换盘提示文本组件，留空则自动查找")]
        [SerializeField] private Text plateSwitchDialogText;
        [SerializeField] private GameObject completeDialog;
        [SerializeField] private Button completeDialogConfirmButton;
        [SerializeField] private Text completeDialogMessageText;
        [SerializeField] private PillCounterController pillCounterController;
        
        [Tooltip("Pill calibration dialog")]
        [SerializeField] private PillCalibrationDialog pillCalibrationDialog;
        
        [Header("Motor Stall Dialog")]
        [SerializeField] private GameObject stalledDialog;
        [SerializeField] private Button clearMotorStallButton;
        [SerializeField] private Text stalledMessageText;
        [SerializeField] private Text stalledTitleText;
        private bool isClearingMotorStall;

        [Header("Manual Servo Tuning")]
        [Tooltip("Slider for directly tuning the servo angle")]
        [SerializeField] private Slider servoAngleTuningSlider;
        [Tooltip("Text showing the current servo angle setting")]
        [SerializeField] private Text servoAngleTuningText;
        [Tooltip("Keyboard step for servo angle tuning with Left/Right arrows.")]
        [SerializeField] private float servoKeyboardStep = 0.02f;
        [Tooltip("Repeat interval while holding Left/Right arrows.")]
        [SerializeField] private float servoKeyboardRepeatInterval = 0.08f;
        
        [Header("Dispense UI (Drug & Controls)")]
        [Tooltip("Image for the current drug")]
        [SerializeField] private Image drugImage;
        
        [Tooltip("Button to skip the current medicine")]
        [SerializeField] private Button skipMedicineButton;
        
        [Tooltip("Pause/resume dispensing button")]
        [SerializeField] private Button pauseResumeButton;
        
        [Tooltip("Pause/resume button text")]
        [SerializeField] private Text pauseResumeButtonText;
        
        [Header("Skip Confirm Dialog")]
        [Tooltip("Skip confirmation dialog")]
        [SerializeField] private GameObject skipConfirmDialog;
        
        [Tooltip("Skip confirmation button")]
        [SerializeField] private Button skipConfirmButton;
        [Tooltip("Button to clean pills from the turntable while the skip confirm dialog is open")]
        [SerializeField] private Button skipCleanTurntableButton;
        
        [Tooltip("Toggle to mark the skipped medicine as dispensed")]
        [SerializeField] private Toggle skipMarkDispensedToggle;

        [Tooltip("Text showing the skipped medicine name")]
        [SerializeField] private Text skipMedicineNameText;
        
        [Header("Next Medicine Preview")]
        [Tooltip("Text showing next medicine information")]
        [SerializeField] private Text nextMedicineText;
        private readonly List<GameObject> spawnedPatientButtons = new List<GameObject>();
        private Coroutine lightBarRoutine;

        // Progress bar smooth animation
        private float targetProgressValue;
        private Coroutine progressAnimRoutine;

        // Currently active sub-page in Home scene
        private HomeSubPage currentSubPage;

        // Dictionary mapping sub-page enum to page GameObject for easy access
        private Dictionary<HomeSubPage, GameObject> subPageMap;

        private bool isStartingPatientFlow = false;
        private bool isStartingAutoFlow = false;
        private bool _scanLocked = false;
        private bool isConfirmingDispense = false;
        private bool isCancellingScan = false;
        private PillBoxIdentificationCoordinator identificationCoordinator;
        private PillBoxIdentificationResult lastIdentificationResult;
        private DispenserController identificationDispenser;
        private TaskCompletionSource<bool> rfidRemovalTcs;
        private bool identificationInvalidatedDuringClose;
        private DispenserController completionDispenser;
        private TaskCompletionSource<bool> completionRfidReportTcs;
        private int completionRfidPresenceVersion;
        private bool isReturningHomeAfterCompletion;
        [Header("Pill Box Removal Safety Settings")]
        [Tooltip("RFID 感应不到药盒后，确认轨道为空的稳定等待时间（毫秒）。默认 1500ms (1.5秒)")]
        [SerializeField] private int completionRfidClearStabilityMilliseconds = 1500;

        [Tooltip("摄像头连续读取不到二维码后，自动收回轨道的稳定等待时间（秒）。默认 1.5秒")]
        [SerializeField] private float barcodeRemovalStabilitySeconds = 1.5f;

        private int CompletionRfidClearStabilityMilliseconds => completionRfidClearStabilityMilliseconds;
        private float BarcodeRemovalStabilitySeconds => barcodeRemovalStabilitySeconds;
        private Color homeScanDialogTitleOriginalColor = Color.black;
        private bool isTitleOriginalColorCaptured = false;

        private void SetHomeScanDialogTitle(string text, bool isError = false)
        {
            if (homeScanDialogTitleText == null) return;

            if (!isTitleOriginalColorCaptured)
            {
                homeScanDialogTitleOriginalColor = homeScanDialogTitleText.color;
                isTitleOriginalColorCaptured = true;
            }

            homeScanDialogTitleText.text = text;
            homeScanDialogTitleText.color = isError ? Color.red : homeScanDialogTitleOriginalColor;
        }

        // Dictionary mapping sub-page enum to its corresponding button
        private Dictionary<HomeSubPage, Button> subPageButtonMap;
        private bool isServoKeyboardTuning;
        private bool servoKeyboardValueChanged;
        private float nextServoKeyboardStepTime;
        private bool deviceLostDialogVisible;

        /// <summary>
        /// Event fired when the active Home sub-page changes.
        /// Subscribers receive the newly activated page type.
        /// </summary>
        public event Action<HomeSubPage> OnSubPageChanged;

        /// <summary>
        /// Gets the currently displayed Home sub-page.
        /// </summary>
        public HomeSubPage CurrentSubPage => currentSubPage;

        private void Start()
        {
            SetupDeviceLostDialog();
            var main = MainController.Instance;
            if (main != null)
            {
                main.DeviceLost += OnDeviceLost;
            }

            var scene = SceneManager.GetActiveScene().name;
            if (scene == homeSceneName)
            {
                InitHome();
            }
            else if (scene == scanSceneName)
            {
                InitScan();
            }
            else if (scene == dispenseSceneName)
            {
                InitDispense();
            }
        }

        private void OnDestroy()
        {
            UnsubscribeEvents();
        }

        private void Update()
        {
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
            if (ShortcutInput.IsTextInputFocused())
            {
                return;
            }

            var scene = SceneManager.GetActiveScene().name;
            if (HandleGlobalDialogShortcuts())
            {
                return;
            }

            if (scene == homeSceneName)
            {
                HandleHomeShortcuts();
            }
            else if (scene == scanSceneName)
            {
                HandleScanShortcuts();
            }
            else if (scene == dispenseSceneName)
            {
                HandleDispenseShortcuts();
            }
#endif
        }

        #region Home

        private void InitHome()
        {
            var main = MainController.Instance;
            if (main != null)
            {
                main.PatientsUpdated += RenderPatientButtons;
                RenderPatientButtons(main.GetPatients());
            }

            if (refreshButton != null)
            {
                refreshButton.onClick.AddListener(() => FireAndForget(RefreshPatientsAsync()));
            }

            if (autoScanButton != null)
            {
                autoScanButton.onClick.AddListener(() => FireAndForget(StartAutoRecognitionFlowAsync()));
            }

            // Adjust scroll sensitivity for the patient list to support comfortable mouse wheel scrolling
            if (patientListRoot != null)
            {
                var scrollRect = patientListRoot.GetComponentInParent<ScrollRect>();
                if (scrollRect != null)
                {
                    scrollRect.scrollSensitivity = 50f;
                }
            }

            // Setup device management button
            if (manageDevicesButton != null)
            {
                manageDevicesButton.onClick.AddListener(OpenDeviceManagementDialog);
            }

            if (cleanTurntableButton != null)
            {
                cleanTurntableButton.onClick.AddListener(() => FireAndForget(CleanTurntableAsync(cleanTurntableButton)));
            }

            // Setup connection required dialog confirm button
            if (connectDialogConfirmButton != null)
            {
                connectDialogConfirmButton.onClick.AddListener(() =>
                {
                    if (connectDispenserDialog != null) connectDispenserDialog.SetActive(false);
                    OpenDeviceManagementDialog();
                });
            }

            // Initialize device manager UI if present
            if (deviceManagerUI == null)
            {
                deviceManagerUI = FindObjectOfType<DeviceManagerUI>();
            }

            // [NEW] Subscribe to connection events
            var dispenser = FindObjectOfType<DispenserController>();
            if (dispenser != null)
            {
                dispenser.OnConnectionStateChanged += OnDispenserConnectionChanged;
                UpdateDeviceButtonState(dispenser.IsConnected);
            }

            // Initialize sub-page switching system
            InitializeSubPages();
        }

        #region Home Sub-Page Management

        /// <summary>
        /// Initializes the sub-page system: creates mappings and sets up button listeners.
        /// Called during Home scene initialization.
        /// </summary>
        private void InitializeSubPages()
        {
            // Create page mapping: enum -> GameObject
            subPageMap = new Dictionary<HomeSubPage, GameObject>
            {
                { HomeSubPage.PatientCard, patientCardPage },
                { HomeSubPage.CountPills, countPillsPage },
                { HomeSubPage.Setting, settingPage }
            };

            // Create button mapping: enum -> Button
            subPageButtonMap = new Dictionary<HomeSubPage, Button>
            {
                { HomeSubPage.PatientCard, patientCardButton },
                { HomeSubPage.CountPills, countPillsButton },
                { HomeSubPage.Setting, settingButton }
            };

            // Setup button click listeners
            SetupSubPageButtonListeners();

            // Show the default page on startup
            ShowSubPage(defaultSubPage);
        }

        /// <summary>
        /// Attaches click listeners to all sub-page navigation buttons.
        /// Each button is configured to switch to its corresponding page when clicked.
        /// </summary>
        private void SetupSubPageButtonListeners()
        {
            // Assign click handler for PatientCard button
            if (patientCardButton != null)
            {
                patientCardButton.onClick.AddListener(() => ShowSubPage(HomeSubPage.PatientCard));
            }

            // Assign click handler for CountPills button
            if (countPillsButton != null)
            {
                countPillsButton.onClick.AddListener(() => ShowSubPage(HomeSubPage.CountPills));
            }

            // Assign click handler for Setting button
            if (settingButton != null)
            {
                settingButton.onClick.AddListener(() => ShowSubPage(HomeSubPage.Setting));
            }
        }

        /// <summary>
        /// Switches to the specified sub-page, hiding all other pages.
        /// This is the main method for sub-page navigation within the Home scene.
        /// </summary>
        /// <param name="targetPage">The sub-page to display.</param>
        public void ShowSubPage(HomeSubPage targetPage)
        {
            // Skip if already on the target page and it's visible
            if (currentSubPage == targetPage && IsSubPageActive(targetPage))
            {
                return;
            }

            // Hide all sub-pages first
            HideAllSubPages();

            // Show the target sub-page
            if (subPageMap != null && subPageMap.TryGetValue(targetPage, out var pageObject) && pageObject != null)
            {
                pageObject.SetActive(true);
                currentSubPage = targetPage;

                // Update button visual states to reflect active page
                UpdateSubPageButtonStates(targetPage);

                // Notify subscribers about the page change
                OnSubPageChanged?.Invoke(targetPage);

                EZLog.D(EZLog.Module.UI, $"Switched to sub-page: {targetPage}");
            }
            else
            {
                EZLog.W(EZLog.Module.UI, $"Sub-page not found or not assigned: {targetPage}");
            }
        }

        /// <summary>
        /// Hides all sub-pages by setting their GameObjects inactive.
        /// Called before showing a new page to ensure only one page is visible at a time.
        /// </summary>
        private void HideAllSubPages()
        {
            if (subPageMap == null)
            {
                return;
            }

            foreach (var kvp in subPageMap)
            {
                if (kvp.Value != null)
                {
                    kvp.Value.SetActive(false);
                }
            }
        }

        /// <summary>
        /// Checks if a specific sub-page is currently active (visible).
        /// </summary>
        /// <param name="page">The sub-page to check.</param>
        /// <returns>True if the sub-page is active, false otherwise.</returns>
        private bool IsSubPageActive(HomeSubPage page)
        {
            if (subPageMap != null && subPageMap.TryGetValue(page, out var pageObject) && pageObject != null)
            {
                return pageObject.activeSelf;
            }
            return false;
        }

        /// <summary>
        /// Updates the visual appearance of navigation buttons to indicate the active sub-page.
        /// The active button gets a highlighted color while others return to default.
        /// </summary>
        /// <param name="activePage">The currently active sub-page.</param>
        private void UpdateSubPageButtonStates(HomeSubPage activePage)
        {
            if (!useButtonHighlight || subPageButtonMap == null)
            {
                return;
            }

            foreach (var kvp in subPageButtonMap)
            {
                var button = kvp.Value;
                if (button == null)
                {
                    continue;
                }

                // Get the button's Image component for color modification
                var buttonImage = button.GetComponent<Image>();
                if (buttonImage == null)
                {
                    continue;
                }

                // Apply active or inactive color based on whether this button's page is active
                bool isActive = kvp.Key == activePage;
                buttonImage.color = isActive ? activeButtonColor : inactiveButtonColor;
            }
        }

        /// <summary>
        /// Programmatically switches to the PatientCard sub-page.
        /// Convenience method for external scripts.
        /// </summary>
        public void GoToPatientCardPage()
        {
            ShowSubPage(HomeSubPage.PatientCard);
        }

        /// <summary>
        /// Programmatically switches to the CountPills sub-page.
        /// Convenience method for external scripts.
        /// </summary>
        public void GoToCountPillsPage()
        {
            ShowSubPage(HomeSubPage.CountPills);
        }

        /// <summary>
        /// Programmatically switches to the Setting sub-page.
        /// Convenience method for external scripts.
        /// </summary>
        public void GoToSettingPage()
        {
            ShowSubPage(HomeSubPage.Setting);
        }

        /// <summary>
        /// Navigates to the next sub-page in the sequence (wraps around).
        /// Useful for implementing swipe gestures or keyboard navigation.
        /// </summary>
        public void GoToNextSubPage()
        {
            int totalPages = Enum.GetValues(typeof(HomeSubPage)).Length;
            int nextIndex = ((int)currentSubPage + 1) % totalPages;
            ShowSubPage((HomeSubPage)nextIndex);
        }

        /// <summary>
        /// Navigates to the previous sub-page in the sequence (wraps around).
        /// Useful for implementing swipe gestures or keyboard navigation.
        /// </summary>
        public void GoToPreviousSubPage()
        {
            int totalPages = Enum.GetValues(typeof(HomeSubPage)).Length;
            int prevIndex = ((int)currentSubPage - 1 + totalPages) % totalPages;
            ShowSubPage((HomeSubPage)prevIndex);
        }

        /// <summary>
        /// Resets to the default sub-page configured in the Inspector.
        /// </summary>
        public void ResetToDefaultSubPage()
        {
            ShowSubPage(defaultSubPage);
        }

        /// <summary>
        /// Opens the device management dialog for Bluetooth connection management
        /// </summary>
        public void OpenDeviceManagementDialog()
        {
            if (deviceManagerUI != null)
            {
                deviceManagerUI.ShowDialog();
                EZLog.D(EZLog.Module.UI, "Device management dialog opened");
            }
            else
            {
                EZLog.W(EZLog.Module.UI, "DeviceManagerUI not assigned or found");
            }
        }

        /// <summary>
        /// Closes the device management dialog
        /// </summary>
        public void CloseDeviceManagementDialog()
        {
            if (deviceManagerUI != null)
            {
                deviceManagerUI.HideDialog();
                EZLog.D(EZLog.Module.UI, "Device management dialog closed");
            }
        }

        /// <summary>
        /// Gets the GameObject reference for a specific sub-page.
        /// Useful for external scripts that need to access page contents.
        /// </summary>
        /// <param name="page">The sub-page type to retrieve.</param>
        /// <returns>The GameObject for the specified sub-page, or null if not found.</returns>
        public GameObject GetSubPageObject(HomeSubPage page)
        {
            if (subPageMap != null && subPageMap.TryGetValue(page, out var pageObject))
            {
                return pageObject;
            }
            return null;
        }

        private void OnDispenserConnectionChanged(string state)
        {
            // state is "Connected", "Disconnected", "Connecting"
            bool isConnected = (state == "Connected");
            UpdateDeviceButtonState(isConnected);
        }

        private void UpdateDeviceButtonState(bool isConnected)
        {
            if (manageDevicesButtonText != null)
            {
                manageDevicesButtonText.text = isConnected ? "分药机已连接" : "分药机未连接";
            }

            if (connectedIcon != null)
            {
                connectedIcon.gameObject.SetActive(isConnected);
            }

            if (disconnectedIcon != null)
            {
                disconnectedIcon.gameObject.SetActive(!isConnected);
            }
        }

        #endregion

        private async Task RefreshPatientsAsync()
        {
            var main = MainController.Instance;
            if (main == null)
            {
                return;
            }

            await main.RefreshPatientsAsync();
        }

        private async Task CleanTurntableAsync(Button sourceButton)
        {
            var main = MainController.Instance;
            if (main == null)
            {
                return;
            }

            var dispenser = FindObjectOfType<DispenserController>();
            if (dispenser == null || !dispenser.IsConnected)
            {
                EZLog.W(EZLog.Module.UI, "Dispenser not connected, showing prompt");
                if (connectDispenserDialog != null)
                {
                    connectDispenserDialog.SetActive(true);
                }
                return;
            }

            if (sourceButton != null)
            {
                sourceButton.interactable = false;
            }

            try
            {
                bool success = await main.CleanTurntableAsync();
                EZLog.I(EZLog.Module.UI, success ? "Turntable cleaned successfully" : "Turntable cleaning failed");
            }
            finally
            {
                if (sourceButton != null)
                {
                    sourceButton.interactable = true;
                }
            }
        }

        private void RenderPatientButtons(List<PatientStatus> patients)
        {
            ClearPatientButtons();

            if (patientListRoot == null || patientButtonPrefab == null || patients == null)
            {
                return;
            }

            foreach (var patient in patients)
            {
                var go = Instantiate(patientButtonPrefab, patientListRoot);
                spawnedPatientButtons.Add(go);

                var button = go.GetComponent<Button>();
                var texts = go.GetComponentsInChildren<Text>();
                
                // Find and set patient name text (usually the first or larger text)
                // Find and set medicine count text (the one showing "X种药品需要分配")
                foreach (var textComponent in texts)
                {
                    if (textComponent.name.Contains("Name") || textComponent == texts[0])
                    {
                        string displayName = patient.PatientName;
                        if (!string.IsNullOrEmpty(patient.BedNumber))
                        {
                            displayName += $" {patient.BedNumber}床";
                        }
                        textComponent.text = displayName;
                    }
                    else if (textComponent.name.Contains("Medicine") || textComponent.name.Contains("Count"))
                    {
                        textComponent.text = $"{patient.MedicineCount}种药品需要分配";
                    }
                }

                if (button != null)
                {
                    // All patients in the list need dispensing, so all buttons are enabled
                    button.interactable = true;
                    var id = patient.PatientId;
                    button.onClick.AddListener(() => OnPatientClicked(id));
                }
            }

            UpdateHomeHint(patients);
        }

        private void ClearPatientButtons()
        {
            foreach (var item in spawnedPatientButtons)
            {
                if (item != null)
                {
                    if (Application.isPlaying)
                    {
                        Destroy(item);
                    }
                    else
                    {
                        DestroyImmediate(item);
                    }
                }
            }
            spawnedPatientButtons.Clear();
        }

        private void UpdateHomeHint(List<PatientStatus> patients)
        {
            if (homeHintText == null || patients == null)
            {
                return;
            }

            var remaining = patients.Count;
            homeHintText.text = remaining > 0
                ? "请点击患者卡片，通过摄像头或 RFID 识别药盒并开始分药"
                : "辛苦了，所有患者的药品都已经分完了";
        }

        private async void OnPatientClicked(string patientId)
        {
            if (isStartingPatientFlow)
            {
                return;
            }

            var main = MainController.Instance;
            if (main == null)
            {
                return;
            }

            // Check if dispenser is connected before proceeding
            var dispenser = FindObjectOfType<DispenserController>();
            if (dispenser == null || !dispenser.IsConnected)
            {
                EZLog.W(EZLog.Module.UI, "Dispenser not connected, showing prompt");
                if (connectDispenserDialog != null)
                {
                    connectDispenserDialog.SetActive(true);
                }
                return;
            }

            isStartingPatientFlow = true;

            // Disable all patient buttons to prevent double-clicks
            ReEnablePatientButtons(false);

            try
            {
                if (!main.TrySelectPatient(patientId, out var patientStatus))
                {
                    EZLog.W(EZLog.Module.UI, "Failed to select patient");
                    ReEnablePatientButtons(true);
                    isStartingPatientFlow = false;
                    return;
                }

                EZLog.I(EZLog.Module.UI, "Opening tray before scanning...");
                if (homeHintText != null)
                {
                    homeHintText.text = "正在打开药仓，请稍候...";
                }

                var opened = await main.OpenTrayAsync();
                if (!opened)
                {
                    EZLog.E(EZLog.Module.UI, "Failed to open tray.");
                    main.ClearCurrentPatient();
                    if (homeHintText != null)
                    {
                        homeHintText.text = "开仓失败，请检查设备！";
                    }
                    ReEnablePatientButtons(true);
                    isStartingPatientFlow = false;
                    return;
                }

                // Tray opened successfully. Now start scanning in Home scene.
                if (scanner == null)
                {
                    scanner = FindObjectOfType<CheckPillBoxController>();
                    if (scanner == null)
                    {
                        scanner = gameObject.AddComponent<CheckPillBoxController>();
                        EZLog.I(EZLog.Module.UI, "CheckPillBoxController created dynamically on UIManager.");
                    }
                }

                _scanLocked = false;
                isConfirmingDispense = false;
                isCancellingScan = false;

                // Setup and show dedicated Home Scan Dialog
                if (homeScanDialog != null)
                {
                    SetHomeScanDialogTitle("放入药盘");
                    if (homeScanDialogMessageText != null)
                    {
                        homeScanDialogMessageText.text = $"请将【{patientStatus.PatientName}】的药盒放入分药机，系统将通过摄像头或 RFID 自动识别。";
                    }

                    if (homeScanInsertIcon != null) homeScanInsertIcon.SetActive(true);
                    if (homeScanPrescriptionDetailsText != null) homeScanPrescriptionDetailsText.gameObject.SetActive(false);

                    if (homeScanConfirmButton != null) homeScanConfirmButton.gameObject.SetActive(false);
                    if (homeScanCancelButton != null)
                    {
                        homeScanCancelButton.gameObject.SetActive(true);
                        homeScanCancelButton.interactable = true;
                        homeScanCancelButton.onClick.RemoveAllListeners();
                        homeScanCancelButton.onClick.AddListener(() => FireAndForget(CancelScanAndReturnHomeAsync()));
                    }

                    if (homeScanSwitchCameraButton != null)
                    {
                        homeScanSwitchCameraButton.gameObject.SetActive(true);
                        homeScanSwitchCameraButton.onClick.RemoveAllListeners();
                        homeScanSwitchCameraButton.onClick.AddListener(OnHomeScanSwitchCameraClicked);
                        UpdateHomeScanSwitchCameraButtonText();
                    }

                    homeScanDialog.SetActive(true);
                }

                // Start both channels after the dialog is initialized. Any UID that
                // arrived immediately after opening is retained by the dispenser and
                // consumed by BeginIdentificationSession.
                BeginIdentificationSession(
                    dispenser,
                    patientStatus.PatientId,
                    patientStatus.PatientName,
                    autoMode: false);

                if (homeHintText != null)
                {
                    homeHintText.text = "请放入药盘...";
                }
            }
            catch (Exception ex)
            {
                EZLog.E(EZLog.Module.UI, $"Error during patient clicked workflow: {ex.Message}");
                main.ClearCurrentPatient();
                ReEnablePatientButtons(true);
                isStartingPatientFlow = false;
            }
        }

        private void ReEnablePatientButtons(bool enable)
        {
            foreach (var btnObj in spawnedPatientButtons)
            {
                if (btnObj != null)
                {
                    var btn = btnObj.GetComponent<Button>();
                    if (btn != null) btn.interactable = enable;
                }
            }
            if (refreshButton != null) refreshButton.interactable = enable;
        }

        #endregion

        #region Scan

        private string ResolvePatientIdByRfid(string uid)
        {
            var main = MainController.Instance;
            return main != null && main.TryResolvePatientIdByRfidUid(uid, out var patientId)
                ? patientId
                : null;
        }

        private void EnsureIdentificationCoordinator()
        {
            if (identificationCoordinator != null)
            {
                return;
            }

            identificationCoordinator = new PillBoxIdentificationCoordinator(ResolvePatientIdByRfid);
            identificationCoordinator.Verified += OnIdentificationVerified;
            identificationCoordinator.Mismatch += OnIdentificationMismatch;
            identificationCoordinator.UnknownRfid += OnUnknownRfid;
            identificationCoordinator.RfidRemoved += OnIdentificationRfidRemoved;
            identificationCoordinator.RfidChanged += OnIdentificationRfidChanged;
            identificationCoordinator.Conflict += OnIdentificationConflict;
        }

        private void BeginIdentificationSession(
            DispenserController dispenser,
            string expectedPatientId,
            string expectedPatientName,
            bool autoMode)
        {
            EndIdentificationSession(stopScanner: true);
            EnsureIdentificationCoordinator();

            identificationDispenser = dispenser;
            identificationCoordinator.StartSession(expectedPatientId, autoMode);
            lastIdentificationResult = null;
            rfidRemovalTcs = null;
            identificationInvalidatedDuringClose = false;

            if (identificationDispenser != null)
            {
                identificationDispenser.OnRfidCardPlaced += OnHardwareRfidPlaced;
                identificationDispenser.OnRfidCardRemoved += OnHardwareRfidRemoved;
                identificationDispenser.OnRfidCardChanged += OnHardwareRfidChanged;

                // The first UID may arrive immediately after OPEN_TRAY, before UI wiring completes.
                if (identificationDispenser.IsRfidCardPresent)
                {
                    identificationCoordinator.HandleRfidPlaced(identificationDispenser.CurrentRfidUid);
                }
            }

            if (scanner != null)
            {
                scanner.OnBoxVerified -= OnBoxVerified;
                scanner.OnBoxMismatch -= OnBoxMismatch;
                scanner.OnScanError -= OnScanError;
                scanner.OnBoxVerified += OnBoxVerified;
                scanner.OnScanError += OnScanError;
                // Matching is centralized here so camera and RFID follow identical rules.
                scanner.StartScanner("", expectedPatientName);
            }
        }

        private void EndIdentificationSession(bool stopScanner)
        {
            if (scanner != null)
            {
                scanner.OnBoxVerified -= OnBoxVerified;
                scanner.OnBoxVerified -= OnAutoBoxVerified;
                scanner.OnBoxMismatch -= OnBoxMismatch;
                scanner.OnScanError -= OnScanError;
                if (stopScanner)
                {
                    scanner.StopScanner();
                }
            }

            if (identificationDispenser != null)
            {
                identificationDispenser.OnRfidCardPlaced -= OnHardwareRfidPlaced;
                identificationDispenser.OnRfidCardRemoved -= OnHardwareRfidRemoved;
                identificationDispenser.OnRfidCardChanged -= OnHardwareRfidChanged;
                identificationDispenser = null;
            }

            identificationCoordinator?.StopSession();
            lastIdentificationResult = null;
            identificationInvalidatedDuringClose = false;
            rfidRemovalTcs?.TrySetCanceled();
            rfidRemovalTcs = null;
        }

        private void OnHardwareRfidPlaced(string uid)
        {
            identificationCoordinator?.HandleRfidPlaced(uid);
        }

        private void OnHardwareRfidRemoved(string uid)
        {
            identificationCoordinator?.HandleRfidRemoved(uid);
        }

        private void OnHardwareRfidChanged(string oldUid, string newUid)
        {
            identificationCoordinator?.HandleRfidChanged(oldUid, newUid);
        }

        private void OnIdentificationVerified(PillBoxIdentificationResult result)
        {
            if (_scanLocked || result == null)
            {
                return;
            }

            _scanLocked = true;
            lastIdentificationResult = result;
            EZLog.I(EZLog.Module.Scanner,
                $"Pill box identified by {result.Source}: patient={result.PatientId}");

            if (identificationCoordinator.IsAutoMode)
            {
                FireAndForget(HandleAutoBoxVerifiedAsync(result.PatientId, result));
            }
            else
            {
                FireAndForget(HandleBoxVerifiedAsync(result));
            }
        }

        private void OnIdentificationMismatch(PillBoxIdentificationResult result, string expectedPatientId)
        {
            if (_scanLocked)
            {
                return;
            }

            _scanLocked = true;
            FireAndForget(HandleBoxMismatchAsync(result?.RawIdentifier ?? string.Empty, result));
        }

        private void OnUnknownRfid(string uid)
        {
            EZLog.W(EZLog.Module.Scanner, $"Unbound RFID pill box detected: {uid}");
            SetHomeScanDialogTitle("RFID 尚未绑定", isError: true);
            if (homeScanDialogMessageText != null)
            {
                homeScanDialogMessageText.text = "该药盒的 RFID 尚未绑定患者，可继续使用摄像头扫描条码。";
            }
        }

        private void OnIdentificationRfidChanged(string oldUid, string newUid)
        {
            EZLog.W(EZLog.Module.Scanner, $"RFID pill box replaced: {oldUid} -> {newUid}");

            if (isCancellingScan)
            {
                return;
            }

            if (isConfirmingDispense)
            {
                identificationInvalidatedDuringClose = true;
                lastIdentificationResult = null;
                if (homeScanConfirmButton != null)
                {
                    homeScanConfirmButton.interactable = false;
                }
                return;
            }

            // Treat UID A -> UID B as an immediate remove/place transition. The
            // coordinator will process UID B right after this callback.
            ResetIdentificationAfterRemoval();
        }

        private void OnIdentificationConflict(
            PillBoxIdentificationResult first,
            PillBoxIdentificationResult second)
        {
            identificationCoordinator?.ClearVerification();
            lastIdentificationResult = null;
            _scanLocked = true;
            scanner?.StopScanner();
            if (homeScanConfirmButton != null)
            {
                homeScanConfirmButton.interactable = false;
                homeScanConfirmButton.gameObject.SetActive(false);
            }
            if (homeScanPrescriptionDetailsText != null)
            {
                homeScanPrescriptionDetailsText.gameObject.SetActive(false);
            }
            SetHomeScanDialogTitle("药盒识别信息不一致", isError: true);
            if (homeScanDialogMessageText != null)
            {
                homeScanDialogMessageText.text = "摄像头与 RFID 指向不同患者，请取出药盒后重新识别。";
            }
        }

        private void OnIdentificationRfidRemoved(string uid)
        {
            EZLog.I(EZLog.Module.Scanner, $"RFID removal received for pill box {uid}");
            if (isCancellingScan && rfidRemovalTcs != null)
            {
                rfidRemovalTcs.TrySetResult(true);
                return;
            }

            if (isConfirmingDispense)
            {
                identificationInvalidatedDuringClose = true;
                identificationCoordinator?.ClearVerification();
                lastIdentificationResult = null;
                if (homeScanConfirmButton != null)
                {
                    homeScanConfirmButton.interactable = false;
                }
                return;
            }

            if (!isCancellingScan)
            {
                ResetIdentificationAfterRemoval();
            }
        }

        private void ResetIdentificationAfterRemoval()
        {
            identificationCoordinator?.ClearVerification();
            lastIdentificationResult = null;
            identificationInvalidatedDuringClose = false;
            _scanLocked = false;

            var main = MainController.Instance;
            var patient = main?.GetCurrentPatient();
            if (identificationCoordinator != null && identificationCoordinator.IsAutoMode)
            {
                main?.ClearCurrentPatient();
            }

            if (homeScanConfirmButton != null)
            {
                homeScanConfirmButton.gameObject.SetActive(false);
            }
            if (homeScanPrescriptionDetailsText != null)
            {
                homeScanPrescriptionDetailsText.gameObject.SetActive(false);
            }
            if (homeScanInsertIcon != null)
            {
                homeScanInsertIcon.SetActive(true);
            }

            SetHomeScanDialogTitle("放入药盒");
            if (homeScanDialogMessageText != null)
            {
                homeScanDialogMessageText.text = identificationCoordinator != null && identificationCoordinator.IsAutoMode
                    ? "药盒已取出，请重新放入任意患者的药盒。系统将通过摄像头或 RFID 自动识别。"
                    : $"药盒已取出，请重新放入【{patient?.PatientName ?? "所选患者"}】的药盒。";
            }

            if (scanner != null)
            {
                scanner.StartScanner("", identificationCoordinator != null && identificationCoordinator.IsAutoMode
                    ? "任意患者"
                    : patient?.PatientName ?? string.Empty);
            }
        }

        private void InitScan()
        {
            var main = MainController.Instance;
            var patient = main?.GetCurrentPatient();

            if (backToHomeButton != null)
            {
                backToHomeButton.onClick.AddListener(() => FireAndForget(CancelScanAndReturnHomeAsync()));
            }

            if (scanner != null && patient != null)
            {
                scanner.OnBoxVerified += OnBoxVerified;
                scanner.OnBoxMismatch += OnBoxMismatch;
                scanner.OnScanError += OnScanError;
                scanner.StartScanner(patient.PatientId);
            }

            // Setup camera switch button
            if (switchCameraButton != null)
            {
                switchCameraButton.onClick.AddListener(OnSwitchCameraClicked);
                UpdateSwitchCameraButtonText();
            }

            if (lightBar != null)
            {
                lightBarRoutine = StartCoroutine(AnimateLightBar());
            }
        }

        /// <summary>
        /// 点击切换摄像头按钮时调用，切换前置/后置摄像头
        /// </summary>
        private void OnSwitchCameraClicked()
        {
            if (scanner == null) return;

            scanner.SwitchCamera();
            UpdateSwitchCameraButtonText();
            EZLog.D(EZLog.Module.UI, $"Camera switched, isFrontFacing={scanner.IsFrontFacing}");
        }

        /// <summary>
        /// 更新切换摄像头按钮的显示文字
        /// </summary>
        private void UpdateSwitchCameraButtonText()
        {
            if (switchCameraButtonText == null || scanner == null) return;
            switchCameraButtonText.text = scanner.IsFrontFacing ? "切换后置" : "切换前置";
        }

        private IEnumerator AnimateLightBar()
        {
            // Simple loop that moves the bar from top to bottom.
            var rect = lightBar;
            var canvasHeight = rect.parent is RectTransform parent ? parent.rect.height : 400f;
            var halfHeight = rect.rect.height * 0.5f;
            var top = canvasHeight * 0.5f - halfHeight;
            var bottom = -top;

            while (true)
            {
                var pos = rect.anchoredPosition;
                pos.y -= lightBarSpeed * Time.deltaTime;
                if (pos.y < bottom)
                {
                    pos.y = top;
                }
                rect.anchoredPosition = pos;
                yield return null;
            }
        }

        private void OnHomeScanSwitchCameraClicked()
        {
            if (scanner == null) return;
            scanner.SwitchCamera();
            UpdateHomeScanSwitchCameraButtonText();
            EZLog.D(EZLog.Module.UI, $"Home camera switched, isFrontFacing={scanner.IsFrontFacing}");
        }

        private void UpdateHomeScanSwitchCameraButtonText()
        {
            if (homeScanSwitchCameraButtonText == null || scanner == null) return;
            homeScanSwitchCameraButtonText.text = scanner.IsFrontFacing ? "切换后置" : "切换前置";
        }

        private void OnBoxVerified(string code)
        {
            if (identificationCoordinator != null && identificationCoordinator.IsActive)
            {
                identificationCoordinator.HandleBarcode(code);
                return;
            }

            if (_scanLocked) return;
            _scanLocked = true;

            FireAndForget(HandleBoxVerifiedAsync());
        }

        private async Task HandleBoxVerifiedAsync(PillBoxIdentificationResult sessionResult = null)
        {
            var main = MainController.Instance;
            string patientName = "";
            string patientId = "";
            string bedNumber = "";
            string medicineInfoText = "无有效分药数据";

            if (main != null)
            {
                var patient = main.GetCurrentPatient();
                if (patient != null)
                {
                    patientName = patient.PatientName;
                    patientId = patient.PatientId;
                    bedNumber = patient.BedNumber;
                }

                // Prepare dispensing plan
                await main.PreparePlanAsync();
                var plan = main.CurrentPlan;
                if (plan != null)
                {
                    var lines = new List<string>();
                    
                    // Format patient header in one line: 患者：张三  病床：02  ID：P0032
                    string bedPart = !string.IsNullOrEmpty(bedNumber) ? $"  病床：{bedNumber}" : "";
                    lines.Add($"患者：{patientName}{bedPart}  ID：{patientId}");

                    // Collect all medicines to find maximum visual width for alignment
                    var allMeds = new List<DispensingMedicine>();
                    if (plan.MedicinesPlate1 != null) allMeds.AddRange(plan.MedicinesPlate1);
                    if (plan.MedicinesPlate2 != null) allMeds.AddRange(plan.MedicinesPlate2);

                    int maxFirstPartWidth = 0;
                    foreach (var m in allMeds)
                    {
                        string firstPart = $"- {m.MedicineName} ({m.DosageSpec})";
                        int w = GetVisualWidth(firstPart);
                        if (w > maxFirstPartWidth) maxFirstPartWidth = w;
                    }

                    // Add medicines list
                    if (plan.MedicinesPlate1 != null && plan.MedicinesPlate1.Count > 0)
                    {
                        lines.Add("\n【餐前/随餐药盘】");
                        foreach (var m in plan.MedicinesPlate1)
                        {
                            string firstPart = $"- {m.MedicineName} ({m.DosageSpec})";
                            string paddedFirstPart = PadRightVisual(firstPart, maxFirstPartWidth + 2);
                            string translatedTiming = TranslateMealTiming(m.MealTiming);
                            lines.Add($"{paddedFirstPart}| 服药时间: {translatedTiming} | 计划天数: {m.DispensingDays}天");
                        }
                    }

                    if (plan.MedicinesPlate2 != null && plan.MedicinesPlate2.Count > 0)
                    {
                        lines.Add("\n【餐后药盘 (药盘2)】");
                        foreach (var m in plan.MedicinesPlate2)
                        {
                            string firstPart = $"- {m.MedicineName} ({m.DosageSpec})";
                            string paddedFirstPart = PadRightVisual(firstPart, maxFirstPartWidth + 2);
                            string translatedTiming = TranslateMealTiming(m.MealTiming);
                            lines.Add($"{paddedFirstPart}| 服药时间: {translatedTiming} | 计划天数: {m.DispensingDays}天");
                        }
                    }

                    if (lines.Count > 0)
                    {
                        medicineInfoText = string.Join("\n", lines);
                    }
                }
            }

            if (sessionResult != null &&
                (identificationCoordinator == null || !identificationCoordinator.IsActive ||
                 identificationCoordinator.VerifiedResult != sessionResult ||
                 lastIdentificationResult != sessionResult))
            {
                EZLog.W(EZLog.Module.Scanner, "Identification changed while preparing the dispensing plan");
                return;
            }

            // Show confirmation dialog with patient's medicine details
            if (homeScanDialog != null)
            {
                SetHomeScanDialogTitle("核验成功");
                if (homeScanDialogMessageText != null)
                {
                    string sourceText = lastIdentificationResult?.Source == PillBoxIdentificationSource.Rfid
                        ? "RFID"
                        : "摄像头";
                    homeScanDialogMessageText.text = $"已通过{sourceText}确认药盒信息，请核对处方并开始分药：";
                }

                if (homeScanInsertIcon != null) homeScanInsertIcon.SetActive(false);
                if (homeScanPrescriptionDetailsText != null)
                {
                    homeScanPrescriptionDetailsText.text = medicineInfoText;
                    homeScanPrescriptionDetailsText.gameObject.SetActive(true);
                }

                if (homeScanConfirmButton != null)
                {
                    homeScanConfirmButton.gameObject.SetActive(true);
                    homeScanConfirmButton.interactable = true;
                    homeScanConfirmButton.onClick.RemoveAllListeners();
                    homeScanConfirmButton.onClick.AddListener(() => FireAndForget(ProceedToDispenseAsync()));
                }

                if (homeScanCancelButton != null)
                {
                    homeScanCancelButton.gameObject.SetActive(true);
                    homeScanCancelButton.interactable = true;
                    homeScanCancelButton.onClick.RemoveAllListeners();
                    homeScanCancelButton.onClick.AddListener(() => FireAndForget(CancelScanAndReturnHomeAsync()));
                }
            }
        }

        private static int GetVisualWidth(string s)
        {
            if (string.IsNullOrEmpty(s)) return 0;
            int width = 0;
            foreach (char c in s)
            {
                // Chinese character ranges (Ideographs, symbols, fullwidth punctuation)
                if (c >= 0x4e00 && c <= 0x9fff || c >= 0x3000 && c <= 0x303f || c >= 0xff00 && c <= 0xffef)
                {
                    width += 2;
                }
                else
                {
                    width += 1;
                }
            }
            return width;
        }

        private static string PadRightVisual(string s, int targetWidth)
        {
            int currentWidth = GetVisualWidth(s);
            if (currentWidth >= targetWidth)
            {
                return s;
            }
            return s + new string(' ', targetWidth - currentWidth);
        }

        private static string TranslateMealTiming(string timing)
        {
            if (string.IsNullOrEmpty(timing)) return "";
            
            string t = timing.ToLower().Trim().Replace("_", " ");
            if (t == "before meal") return "餐前";
            if (t == "after meal") return "餐后";
            if (t == "with meal") return "随餐";
            
            if (timing.Contains("前")) return "餐前";
            if (timing.Contains("后")) return "餐后";
            if (timing.Contains("随")) return "随餐";
            
            return timing;
        }

        private void OnBoxMismatch(string code)
        {
            if (identificationCoordinator != null && identificationCoordinator.IsActive)
            {
                identificationCoordinator.HandleBarcode(code);
                return;
            }

            if (_scanLocked) return;
            _scanLocked = true;

            FireAndForget(HandleBoxMismatchAsync(code));
        }

        private async Task HandleBoxMismatchAsync(
            string code,
            PillBoxIdentificationResult sessionResult = null)
        {
            EZLog.W(EZLog.Module.UI, $"Pillbox mismatch scanned: {code}");
            
            var main = MainController.Instance;
            var patient = main?.GetCurrentPatient();
            string expectedName = patient != null ? patient.PatientName : "";

            if (scanner != null)
            {
                scanner.StopScanner();
            }

            // Update text on active dialog to show mismatch error
            SetHomeScanDialogTitle("放入的药盒不属于所选的患者", isError: true);
            if (homeScanDialogMessageText != null)
            {
                homeScanDialogMessageText.text = $"请放入【{expectedName}】的药盒。";
            }

            // Wait 2 seconds before resuming camera scanning.
            await Task.Delay(2000);

            if (sessionResult != null && lastIdentificationResult != null)
            {
                EZLog.I(EZLog.Module.Scanner,
                    "Ignoring stale mismatch UI because a newer pill box was verified");
                return;
            }

            _scanLocked = false;

            if (identificationCoordinator != null && identificationCoordinator.IsActive)
            {
                // A mismatching RFID-tagged box must be physically removed before another
                // source can verify a different patient.
                if (identificationCoordinator.IsRfidPresent)
                {
                    if (homeScanDialogMessageText != null)
                    {
                        homeScanDialogMessageText.text = $"请取出当前药盒，再放入【{expectedName}】的药盒。";
                    }
                    return;
                }

                identificationCoordinator.ClearVerification();
            }

            if (scanner != null && patient != null)
            {
                scanner.StartScanner("", patient.PatientName);
                // Reset warning text back to normal
                SetHomeScanDialogTitle("放入药盘");
                if (homeScanDialogMessageText != null)
                {
                    homeScanDialogMessageText.text = $"请将【{patient.PatientName}】的药盒放入分药机舱内进行扫描。";
                }
            }
        }

        private void OnScanError(string error)
        {
            if (identificationCoordinator != null && identificationCoordinator.IsActive)
            {
                if (_scanLocked || identificationCoordinator.VerifiedResult != null)
                {
                    EZLog.W(EZLog.Module.Scanner,
                        $"Camera error ignored because identification is already being handled: {error}");
                    return;
                }

                EZLog.W(EZLog.Module.Scanner, $"Camera scan unavailable; RFID remains active: {error}");
                SetHomeScanDialogTitle("摄像头暂不可用", isError: true);
                if (homeScanDialogMessageText != null)
                {
                    homeScanDialogMessageText.text = "仍可将带 RFID 的药盒放入检测区域完成识别。";
                }
                return;
            }

            if (_scanLocked) return;
            _scanLocked = true;

            FireAndForget(HandleScanErrorAsync(error));
        }

        private async Task HandleScanErrorAsync(string error)
        {
            EZLog.W(EZLog.Module.UI, $"Pillbox scan error: {error}");

            var main = MainController.Instance;
            var patient = main?.GetCurrentPatient();

            if (scanner != null)
            {
                scanner.StopScanner();
            }

            SetHomeScanDialogTitle("扫码识别出错", isError: true);
            if (homeScanDialogMessageText != null)
            {
                homeScanDialogMessageText.text = $"请调整药盒位置！\n\n错误信息：{error}";
            }

            await Task.Delay(2000);

            _scanLocked = false;

            if (scanner != null)
            {
                if (isStartingAutoFlow)
                {
                    scanner.StartScanner("", "任意患者");
                    SetHomeScanDialogTitle("放入药盘");
                    if (homeScanDialogMessageText != null)
                    {
                        homeScanDialogMessageText.text = "请将任意患者的药盒放入分药机舱内进行扫描。";
                    }
                }
                else if (patient != null)
                {
                    scanner.StartScanner(patient.PatientId, patient.PatientName);
                    SetHomeScanDialogTitle("放入药盘");
                    if (homeScanDialogMessageText != null)
                    {
                        homeScanDialogMessageText.text = $"请将【{patient.PatientName}】的药盒放入分药机舱内进行扫描。";
                    }
                }
            }
        }

        private async Task ProceedToDispenseAsync()
        {
            if (isConfirmingDispense) return;

            if (identificationCoordinator != null && identificationCoordinator.HasSeenRfid &&
                !identificationCoordinator.IsRfidPresent)
            {
                ResetIdentificationAfterRemoval();
                return;
            }

            identificationInvalidatedDuringClose = false;
            isConfirmingDispense = true;

            var main = MainController.Instance;
            if (main != null)
            {
                // RFID and barcode identify different physical pill-box types.
                // Preserve the verified type across the scene transition so the
                // completion flow uses the matching removal safeguard.
                bool usesRfid = lastIdentificationResult?.Source == PillBoxIdentificationSource.Rfid;
                main.SetCurrentPillBoxUsesRfid(usesRfid);
                EZLog.I(EZLog.Module.UI,
                    $"Saved pill-box identification type for dispensing: {(usesRfid ? "RFID" : "Barcode")}");
            }

            if (scanner != null)
            {
                scanner.StopScanner();
            }

            // Show "closing tray..." text on confirm popup and disable buttons
            if (homeScanDialogMessageText != null)
            {
                homeScanDialogMessageText.text = "正在关闭药仓，请稍候...";
            }
            if (homeScanConfirmButton != null) homeScanConfirmButton.interactable = false;
            if (homeScanCancelButton != null) homeScanCancelButton.interactable = false;

            if (main != null)
            {
                // Skip explicit CloseTrayAsync before loading dispense scene — SendPillMatrix will handle tray positioning directly
                EZLog.I(EZLog.Module.UI, "Skipping explicit CloseTray before loading dispense scene (testing direct SendPillMatrix)");
                /*
                EZLog.I(EZLog.Module.UI, "Closing tray before loading dispense scene...");
                var closed = await main.CloseTrayAsync();
                if (!closed)
                {
                    EZLog.E(EZLog.Module.UI, "Failed to close tray.");
                    bool identificationWasInvalidated = identificationInvalidatedDuringClose;
                    isConfirmingDispense = false;
                    if (identificationWasInvalidated)
                    {
                        ResetIdentificationAfterRemoval();
                        SetHomeScanDialogTitle("药盒已取出", isError: true);
                        if (homeScanDialogMessageText != null)
                        {
                            homeScanDialogMessageText.text = "关仓失败，且药盒已取出。请检查设备连接后重新识别。";
                        }
                        if (homeScanCancelButton != null) homeScanCancelButton.interactable = true;
                        return;
                    }

                    if (homeScanDialogMessageText != null)
                    {
                        homeScanDialogMessageText.text = "关仓失败，请检查设备！\n若舱门已手动关闭，请重新点击确认。";
                    }
                    if (homeScanConfirmButton != null) homeScanConfirmButton.interactable = true;
                    if (homeScanCancelButton != null) homeScanCancelButton.interactable = true;
                    return;
                }

                if (identificationInvalidatedDuringClose)
                {
                    EZLog.W(EZLog.Module.Scanner, "RFID pill box was removed while the tray was closing; reopening tray");
                    await main.OpenTrayAsync();
                    isConfirmingDispense = false;
                    ResetIdentificationAfterRemoval();
                    return;
                }
                */
            }

            if (homeScanDialog != null)
            {
                homeScanDialog.SetActive(false);
            }

            isConfirmingDispense = false;
            _scanLocked = false;
            EndIdentificationSession(stopScanner: true);

            await LoadSceneAsyncSafe(dispenseSceneName);
        }

        private async Task CancelScanAndReturnHomeAsync()
        {
            if (isCancellingScan) return;
            isCancellingScan = true;

            SetHomeScanDialogTitle("正在退出");
            if (homeScanDialogMessageText != null)
            {
                homeScanDialogMessageText.text = "请取出药盒，系统检测到药盒离开后将自动关闭舱门并返回。";
            }
            if (homeScanConfirmButton != null) homeScanConfirmButton.gameObject.SetActive(false);
            if (homeScanCancelButton != null) homeScanCancelButton.gameObject.SetActive(false);

            bool waitForRfidRemoval = identificationCoordinator != null && identificationCoordinator.HasSeenRfid;
            if (waitForRfidRemoval)
            {
                EZLog.I(EZLog.Module.UI, "Waiting for RFID NO CARD before closing tray...");
                if (identificationCoordinator.IsRfidPresent)
                {
                    rfidRemovalTcs = new TaskCompletionSource<bool>();
                    await rfidRemovalTcs.Task;
                    rfidRemovalTcs = null;
                }
            }
            else if (scanner != null)
            {
                EZLog.I(EZLog.Module.UI, "Waiting for barcode to be removed...");
                scanner.SetStatus("请取出药盘...");
                bool barcodeRemoved = await scanner.WaitForNoBarcodeAsync(BarcodeRemovalStabilitySeconds);
                scanner.StopScanner();
                scanner.OnBoxVerified -= OnBoxVerified;
                scanner.OnBoxMismatch -= OnBoxMismatch;
                scanner.OnScanError -= OnScanError;
                if (!barcodeRemoved)
                {
                    SetHomeScanDialogTitle("摄像头检测失败", isError: true);
                    if (homeScanDialogMessageText != null)
                    {
                        homeScanDialogMessageText.text = "无法确认二维码药盒是否已取出，轨道不会收回。请检查摄像头后重试。";
                    }
                    if (homeScanCancelButton != null)
                    {
                        homeScanCancelButton.gameObject.SetActive(true);
                        homeScanCancelButton.interactable = true;
                    }
                    isCancellingScan = false;
                    return;
                }
            }

            if (homeScanDialog != null)
            {
                homeScanDialog.SetActive(false);
            }
            
            _scanLocked = false;
            EndIdentificationSession(stopScanner: true);

            var main = MainController.Instance;
            if (main != null)
            {
                EZLog.I(EZLog.Module.UI, "Closing tray on cancel...");
                await main.CloseTrayAsync();
                main.ClearCurrentPatient();
            }

            isCancellingScan = false;
            await LoadSceneAsyncSafe(homeSceneName);
        }

        private async Task StartAutoRecognitionFlowAsync()
        {
            if (isStartingAutoFlow || isStartingPatientFlow)
            {
                return;
            }

            var main = MainController.Instance;
            if (main == null)
            {
                return;
            }

            // Check if dispenser is connected before proceeding
            var dispenser = FindObjectOfType<DispenserController>();
            if (dispenser == null || !dispenser.IsConnected)
            {
                EZLog.W(EZLog.Module.UI, "Dispenser not connected, showing prompt");
                if (connectDispenserDialog != null)
                {
                    connectDispenserDialog.SetActive(true);
                }
                return;
            }

            isStartingAutoFlow = true;

            // Disable card buttons and the auto button
            ReEnablePatientButtons(false);
            if (autoScanButton != null) autoScanButton.interactable = false;

            try
            {
                EZLog.I(EZLog.Module.UI, "Opening tray before auto scan...");
                if (homeHintText != null)
                {
                    homeHintText.text = "正在打开药仓，请稍候...";
                }

                var opened = await main.OpenTrayAsync();
                if (!opened)
                {
                    EZLog.E(EZLog.Module.UI, "Failed to open tray in auto recognition flow.");
                    if (homeHintText != null)
                    {
                        homeHintText.text = "开仓失败，请检查设备！";
                    }
                    ReEnablePatientButtons(true);
                    if (autoScanButton != null) autoScanButton.interactable = true;
                    isStartingAutoFlow = false;
                    return;
                }

                // Tray opened successfully. Setup scanner.
                if (scanner == null)
                {
                    scanner = FindObjectOfType<CheckPillBoxController>();
                    if (scanner == null)
                    {
                        scanner = gameObject.AddComponent<CheckPillBoxController>();
                        EZLog.I(EZLog.Module.UI, "CheckPillBoxController created dynamically on UIManager.");
                    }
                }

                _scanLocked = false;
                isConfirmingDispense = false;
                isCancellingScan = false;

                // Setup and show dedicated Home Scan Dialog
                if (homeScanDialog != null)
                {
                    SetHomeScanDialogTitle("放入药盘");
                    if (homeScanDialogMessageText != null)
                    {
                        homeScanDialogMessageText.text = "请放入任意患者的药盒，系统将通过摄像头或 RFID 自动识别。";
                    }

                    if (homeScanInsertIcon != null) homeScanInsertIcon.SetActive(true);
                    if (homeScanPrescriptionDetailsText != null) homeScanPrescriptionDetailsText.gameObject.SetActive(false);

                    if (homeScanConfirmButton != null) homeScanConfirmButton.gameObject.SetActive(false);
                    if (homeScanCancelButton != null)
                    {
                        homeScanCancelButton.gameObject.SetActive(true);
                        homeScanCancelButton.interactable = true;
                        homeScanCancelButton.onClick.RemoveAllListeners();
                        homeScanCancelButton.onClick.AddListener(() => FireAndForget(CancelScanAndReturnHomeAsync()));
                    }

                    if (homeScanSwitchCameraButton != null)
                    {
                        homeScanSwitchCameraButton.gameObject.SetActive(true);
                        homeScanSwitchCameraButton.onClick.RemoveAllListeners();
                        homeScanSwitchCameraButton.onClick.AddListener(OnHomeScanSwitchCameraClicked);
                        UpdateHomeScanSwitchCameraButtonText();
                    }

                    homeScanDialog.SetActive(true);
                }

                // Initialize the dual-channel session only after the dialog is ready
                // so an already-received UID cannot have its status text overwritten.
                BeginIdentificationSession(dispenser, "", "任意患者", autoMode: true);

                if (homeHintText != null)
                {
                    homeHintText.text = "请放入药盘...";
                }
            }
            catch (Exception ex)
            {
                EZLog.E(EZLog.Module.UI, $"Error during auto recognition workflow: {ex.Message}");
                ReEnablePatientButtons(true);
                if (autoScanButton != null) autoScanButton.interactable = true;
                isStartingAutoFlow = false;
            }
        }

        private void OnAutoBoxVerified(string code)
        {
            if (identificationCoordinator != null && identificationCoordinator.IsActive)
            {
                identificationCoordinator.HandleBarcode(code);
                return;
            }

            if (_scanLocked) return;
            _scanLocked = true;

            FireAndForget(HandleAutoBoxVerifiedAsync(code));
        }

        private async Task HandleAutoBoxVerifiedAsync(
            string code,
            PillBoxIdentificationResult sessionResult = null)
        {
            var main = MainController.Instance;
            if (main == null)
            {
                _scanLocked = false;
                return;
            }

            // 1. Parse patient ID from barcode
            string parsedPatientId = CheckPillBoxController.ParsePatientIdFromBarcode(code);
            EZLog.I(EZLog.Module.UI, $"Auto recognized patient ID: {parsedPatientId}");

            // 2. Lookup patient in local status database
            if (!main.TrySelectPatient(parsedPatientId, out var patientStatus))
            {
                EZLog.W(EZLog.Module.UI, $"Patient ID '{parsedPatientId}' not found in database.");
                SetHomeScanDialogTitle("请放入需要封药的患者的药盒", isError: true);
                if (homeScanDialogMessageText != null)
                {
                    homeScanDialogMessageText.text = "当前药盒无效或者所属患者今天无需分药，请重新放入药盒。";
                }
                
                await Task.Delay(2000);
                if (!IsIdentificationResultCurrent(sessionResult)) return;
                ResumeAutoIdentificationAfterError();
                return;
            }

            // 3. Check today's tasks
            if (patientStatus.MedicineCount == 0)
            {
                EZLog.W(EZLog.Module.UI, $"Patient '{patientStatus.PatientName}' has no dispensing task today.");
                SetHomeScanDialogTitle("请放入需要封药的患者的药盒", isError: true);
                if (homeScanDialogMessageText != null)
                {
                    homeScanDialogMessageText.text = "当前药盒无效或者所属患者今天无需分药，请重新放入药盒。";
                }
                main.ClearCurrentPatient(); // clear selection since we cannot dispense
                
                await Task.Delay(2000);
                if (!IsIdentificationResultCurrent(sessionResult)) return;
                ResumeAutoIdentificationAfterError();
                return;
            }

            if (patientStatus.IsCompleted)
            {
                EZLog.W(EZLog.Module.UI, $"Patient '{patientStatus.PatientName}' task today is already completed.");
                SetHomeScanDialogTitle("请放入需要封药的患者的药盒", isError: true);
                if (homeScanDialogMessageText != null)
                {
                    homeScanDialogMessageText.text = "当前药盒无效或者所属患者今天无需分药，请重新放入药盒。";
                }
                main.ClearCurrentPatient();
                
                await Task.Delay(2000);
                if (!IsIdentificationResultCurrent(sessionResult)) return;
                ResumeAutoIdentificationAfterError();
                return;
            }

            // 4. Valid patient and task today. Prepare plan.
            string patientName = patientStatus.PatientName;
            string patientId = patientStatus.PatientId;
            string bedNumber = patientStatus.BedNumber;
            string medicineInfoText = "无有效分药数据";

            await main.PreparePlanAsync();
            var plan = main.CurrentPlan;
            if (plan != null)
            {
                var lines = new List<string>();
                
                // Format patient header in one line: 患者：张三  病床：02  ID：P0032
                string bedPart = !string.IsNullOrEmpty(bedNumber) ? $"  病床：{bedNumber}" : "";
                lines.Add($"患者：{patientName}{bedPart}  ID：{patientId}");

                // Collect all medicines to find maximum visual width for alignment
                var allMeds = new List<DispensingMedicine>();
                if (plan.MedicinesPlate1 != null) allMeds.AddRange(plan.MedicinesPlate1);
                if (plan.MedicinesPlate2 != null) allMeds.AddRange(plan.MedicinesPlate2);

                int maxFirstPartWidth = 0;
                foreach (var m in allMeds)
                {
                    string firstPart = $"- {m.MedicineName} ({m.DosageSpec})";
                    int w = GetVisualWidth(firstPart);
                    if (w > maxFirstPartWidth) maxFirstPartWidth = w;
                }

                // Add medicines list
                if (plan.MedicinesPlate1 != null && plan.MedicinesPlate1.Count > 0)
                {
                    lines.Add("\n【餐前/随餐药盘】");
                    foreach (var m in plan.MedicinesPlate1)
                    {
                        string firstPart = $"- {m.MedicineName} ({m.DosageSpec})";
                        string paddedFirstPart = PadRightVisual(firstPart, maxFirstPartWidth + 2);
                        string translatedTiming = TranslateMealTiming(m.MealTiming);
                        lines.Add($"{paddedFirstPart}| 服药时间: {translatedTiming} | 计划天数: {m.DispensingDays}天");
                    }
                }

                if (plan.MedicinesPlate2 != null && plan.MedicinesPlate2.Count > 0)
                {
                    lines.Add("\n【餐后药盘 (药盘2)】");
                    foreach (var m in plan.MedicinesPlate2)
                    {
                        string firstPart = $"- {m.MedicineName} ({m.DosageSpec})";
                        string paddedFirstPart = PadRightVisual(firstPart, maxFirstPartWidth + 2);
                        string translatedTiming = TranslateMealTiming(m.MealTiming);
                        lines.Add($"{paddedFirstPart}| 服药时间: {translatedTiming} | 计划天数: {m.DispensingDays}天");
                    }
                }

                if (lines.Count > 0)
                {
                    medicineInfoText = string.Join("\n", lines);
                }
            }

            if (!IsIdentificationResultCurrent(sessionResult))
            {
                EZLog.W(EZLog.Module.Scanner, "Auto identification changed while preparing the dispensing plan");
                return;
            }

            // Show confirmation dialog with patient's medicine details
            if (homeScanDialog != null)
            {
                SetHomeScanDialogTitle("核验成功");
                if (homeScanDialogMessageText != null)
                {
                    string sourceText = lastIdentificationResult?.Source == PillBoxIdentificationSource.Rfid
                        ? "RFID"
                        : "摄像头";
                    homeScanDialogMessageText.text = $"已通过{sourceText}确认药盒信息，请核对处方并开始分药：";
                }

                if (homeScanInsertIcon != null) homeScanInsertIcon.SetActive(false);
                if (homeScanPrescriptionDetailsText != null)
                {
                    homeScanPrescriptionDetailsText.text = medicineInfoText;
                    homeScanPrescriptionDetailsText.gameObject.SetActive(true);
                }

                if (homeScanConfirmButton != null)
                {
                    homeScanConfirmButton.gameObject.SetActive(true);
                    homeScanConfirmButton.interactable = true;
                    homeScanConfirmButton.onClick.RemoveAllListeners();
                    homeScanConfirmButton.onClick.AddListener(() => FireAndForget(ProceedToDispenseAsync()));
                }

                if (homeScanCancelButton != null)
                {
                    homeScanCancelButton.gameObject.SetActive(true);
                    homeScanCancelButton.interactable = true;
                    homeScanCancelButton.onClick.RemoveAllListeners();
                    homeScanCancelButton.onClick.AddListener(() => FireAndForget(CancelScanAndReturnHomeAsync()));
                }
            }
        }

        private bool IsIdentificationResultCurrent(PillBoxIdentificationResult sessionResult)
        {
            // A null token identifies the legacy Scan scene, which does not use the
            // dual-channel coordinator.
            if (sessionResult == null)
            {
                return true;
            }

            return identificationCoordinator != null && identificationCoordinator.IsActive &&
                   identificationCoordinator.VerifiedResult == sessionResult &&
                   lastIdentificationResult == sessionResult;
        }

        private void ResumeAutoIdentificationAfterError()
        {
            _scanLocked = false;

            if (identificationCoordinator != null && identificationCoordinator.IsActive)
            {
                if (identificationCoordinator.IsRfidPresent)
                {
                    if (homeScanDialogMessageText != null)
                    {
                        homeScanDialogMessageText.text = "请取出当前药盒，再放入需要分药患者的药盒。";
                    }
                    return;
                }

                identificationCoordinator.ClearVerification();
            }

            if (scanner != null)
            {
                scanner.StartScanner("", "任意患者");
            }
            SetHomeScanDialogTitle("放入药盒");
            if (homeScanDialogMessageText != null)
            {
                homeScanDialogMessageText.text = "请放入任意患者的药盒，系统将通过摄像头或 RFID 自动识别。";
            }
        }

        #endregion

        #region Dispense

        private void InitDispense()
        {
            var main = MainController.Instance;
            if (main != null)
            {
                main.DispensingProgressChanged += UpdateDispenseUI;
                main.DispensingError += ShowDispenseError;
                main.DispensingCompleted += OnDispenseCompleted;
                main.ServoAngleChanged += OnServoAngleChangedBySystem;
                main.PlateSwitchRequired += OnPlateSwitchRequired;
                main.MedicineSkipped += OnMedicineSkipped;
                main.MotorStallChanged += OnMotorStallChanged;
            }

            if (clearMotorStallButton != null)
                clearMotorStallButton.onClick.AddListener(OnClearMotorStallClicked);
            OnMotorStallChanged(main != null && main.IsMotorStalled);

            if (captureBackgroundButton != null && pillCounterController != null)
            {
                captureBackgroundButton.onClick.AddListener(() => pillCounterController.CaptureBackground());
            }
            
            // Setup skip button to skip current medicine when clicked
            if (skipMedicineButton != null)
            {
                skipMedicineButton.onClick.AddListener(OnSkipMedicineClicked);
            }

            // Setup pause/resume button
            if (pauseResumeButton != null)
            {
                pauseResumeButton.onClick.AddListener(OnPauseResumeClicked);
            }

            // Subscribe to pause state changes from dispenser
            var dispenser = FindObjectOfType<DispenserController>();
            if (dispenser != null)
            {
                dispenser.OnPauseStateChanged += UpdatePauseButtonUI;
                // Initialize button text to current state
                UpdatePauseButtonUI(dispenser.IsPaused);
            }

            // Setup next medicine text reminder in TopBar
            if (nextMedicineText == null)
            {
                var topBar = GameObject.Find("TopBar");
                if (topBar != null)
                {
                    var texts = topBar.GetComponentsInChildren<Text>(true);
                    nextMedicineText = texts.FirstOrDefault(t => t.gameObject.name == "NextMedicineText" || t.gameObject.name.Contains("TipsText"));
                }
            }

            if (nextMedicineText != null)
            {
                nextMedicineText.gameObject.SetActive(true);
            }

            if (main != null)
            {
                main.SkipConfirmRequired += OnSkipConfirmRequired;
                FireAndForget(main.StartDispensingAsync());
            }

            // Setup skip confirm dialog button
            if (skipConfirmButton != null)
            {
                skipConfirmButton.onClick.AddListener(OnSkipConfirmClicked);
            }

            if (skipCleanTurntableButton != null)
            {
                skipCleanTurntableButton.onClick.AddListener(() => FireAndForget(CleanTurntableAsync(skipCleanTurntableButton)));
            }

            // Hide skip dialog initially
            if (skipConfirmDialog != null)
            {
                skipConfirmDialog.SetActive(false);
            }

            // Setup manual servo angle tuning slider
            if (servoAngleTuningSlider != null)
            {
                servoAngleTuningSlider.minValue = 0.0f;
                servoAngleTuningSlider.maxValue = 1.0f;
                servoAngleTuningSlider.value = 0.5f;
                servoAngleTuningSlider.onValueChanged.AddListener(OnServoAngleTuningChanged);
                OnServoAngleTuningChanged(servoAngleTuningSlider.value);
                var sliderNavigation = servoAngleTuningSlider.navigation;
                sliderNavigation.mode = Navigation.Mode.None;
                servoAngleTuningSlider.navigation = sliderNavigation;

                var trigger = servoAngleTuningSlider.gameObject.GetComponent<EventTrigger>() ?? 
                              servoAngleTuningSlider.gameObject.AddComponent<EventTrigger>();
                
                var entry = new EventTrigger.Entry { eventID = EventTriggerType.PointerUp };
                entry.callback.AddListener((data) => { OnServoAngleTuningReleased(); });
                trigger.triggers.Add(entry);
            }
        }
        
        /// <summary>
        /// Called when the servo angle slider is dragged (updates UI text only)
        /// </summary>
        private void OnServoAngleTuningChanged(float servoAngle)
        {
            if (servoAngleTuningText != null)
            {
                servoAngleTuningText.text = $"舵机：{servoAngle:F2}";
            }
        }

        /// <summary>
        /// Called when the user releases the slider pointer, sending command to STM32.
        /// </summary>
        private void OnServoAngleTuningReleased()
        {
            if (servoAngleTuningSlider == null) return;

            float servoAngle = servoAngleTuningSlider.value;
            FireAndForget(ApplyServoAngleTuningAsync(servoAngle));
        }

        private void OnMotorStallChanged(bool stalled)
        {
            if (stalledDialog == null) return;
            stalledDialog.SetActive(stalled);
            if (!stalled) return;
            ResetServoKeyboardTuningState();
            if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(null);
            stalledDialog.transform.SetAsLastSibling();
            int motorId = MainController.Instance.CurrentStalledMotor;
            if (stalledTitleText != null) stalledTitleText.text = $"{motorId} 号电机堵转";
            if (stalledMessageText != null)
                stalledMessageText.text = $"请清理 {motorId} 号电机卡住的异物，清理完成后点击解除堵转。";
            if (clearMotorStallButton != null)
                clearMotorStallButton.interactable = !isClearingMotorStall;
        }

        private void OnClearMotorStallClicked()
        {
            if (!isClearingMotorStall) FireAndForget(ClearMotorStallFromDialogAsync());
        }

        private async Task ClearMotorStallFromDialogAsync()
        {
            var main = MainController.Instance;
            if (main == null || !main.IsMotorStalled) return;
            isClearingMotorStall = true;
            if (clearMotorStallButton != null) clearMotorStallButton.interactable = false;
            if (stalledMessageText != null) stalledMessageText.text = $"正在发送 {main.CurrentStalledMotor} 号电机解除堵转指令…";
            try
            {
                bool acknowledged = await main.ClearMotorStallAsync();
                if (this != null && !acknowledged && main.IsMotorStalled && stalledMessageText != null)
                    stalledMessageText.text = $"未确认 {main.CurrentStalledMotor} 号电机解除指令或再次收到堵转，请检查设备状态后再操作。";
            }
            finally
            {
                isClearingMotorStall = false;
                if (this != null && clearMotorStallButton != null) clearMotorStallButton.interactable = true;
            }
        }

        private async Task ApplyServoAngleTuningAsync(float servoAngle)
        {
            var dispenser = FindObjectOfType<DispenserController>();
            
            if (dispenser != null && dispenser.IsConnected)
            {
                EZLog.I(EZLog.Module.UI, $"Manual servo tuning released: servo={servoAngle:F2}");

                var main = MainController.Instance;
                int servoSession = main != null ? main.ActiveServoTuningSession : -1;
                var servoTcs = new TaskCompletionSource<bool>();
                dispenser.SetServoAngle(servoAngle, success => 
                { 
                    if (success && main != null)
                    {
                        main.RecordManualServoAngle(servoAngle, servoSession);
                    }
                    servoTcs.TrySetResult(success); 
                });
                await servoTcs.Task;
            }
        }

        /// <summary>
        /// Called when skip button is clicked - skips current medicine
        /// </summary>
        private void OnSkipMedicineClicked()
        {
            var main = MainController.Instance;
            if (main != null)
            {
                EZLog.D(EZLog.Module.UI, "Skip button clicked");
                main.SkipCurrentMedicine();
            }
        }
        
        /// <summary>
        /// Called when a medicine is skipped - shows feedback to user
        /// </summary>
        private void OnMedicineSkipped(string medicineName)
        {
            EZLog.D(EZLog.Module.UI, $"Medicine skipped: {medicineName}");
        }

        /// <summary>
        /// Called when skip command sent — show confirmation dialog
        /// </summary>
        private void OnSkipConfirmRequired(string medicineName)
        {
            EZLog.D(EZLog.Module.UI, $"Showing skip confirm dialog for: {medicineName}");
            
            if (skipMedicineNameText != null)
            {
                skipMedicineNameText.text = $"已跳过药物：{medicineName}";
            }
            
            // Reset toggle to unchecked (default: don't mark as dispensed)
            if (skipMarkDispensedToggle != null)
            {
                skipMarkDispensedToggle.isOn = false;
            }
            
            if (skipConfirmDialog != null)
            {
                skipConfirmDialog.SetActive(true);
            }
        }

        /// <summary>
        /// Called when user clicks confirm in skip dialog
        /// </summary>
        private void OnSkipConfirmClicked()
        {
            bool markAsDispensed = skipMarkDispensedToggle != null && skipMarkDispensedToggle.isOn;
            
            EZLog.D(EZLog.Module.UI, $"Skip confirmed, markAsDispensed={markAsDispensed}");
            
            if (skipConfirmDialog != null)
            {
                skipConfirmDialog.SetActive(false);
            }
            
            var main = MainController.Instance;
            main?.ConfirmSkipReady(markAsDispensed);
        }

        /// <summary>
        /// Called when pause/resume button is clicked - toggles dispensing pause state
        /// </summary>
        private void OnPauseResumeClicked()
        {
            var dispenser = FindObjectOfType<DispenserController>();
            if (dispenser == null) return;

            if (dispenser.IsPaused)
            {
                EZLog.D(EZLog.Module.UI, "Resume button clicked");
                dispenser.ResumeDispensing();
            }
            else
            {
                EZLog.D(EZLog.Module.UI, "Pause button clicked");
                dispenser.PauseDispenser();
            }
        }

        /// <summary>
        /// Updates pause button UI based on current pause state
        /// </summary>
        private void UpdatePauseButtonUI(bool isPaused)
        {
            if (pauseResumeButtonText != null)
            {
                pauseResumeButtonText.text = isPaused ? "继续" : "暂停";
            }
        }



        private void UpdateDispenseUI(DispensingProgressInfo info)
        {
            if (info == null)
            {
                return;
            }

            if (totalPillsText != null)
            {
                int remainingPills = Mathf.Max(0, info.TotalPills - info.DispensedPills);
                totalPillsText.text = $"{remainingPills}";
            }

            if (medicineNameText != null)
            {
                medicineNameText.text = $"{info.MedicineName}  {info.TotalPills}粒";
            }

            if (patientNameText != null)
            {
                patientNameText.text = string.IsNullOrEmpty(info.PatientName)
                    ? string.Empty
                    : $"所属患者： {info.PatientName}";
            }

            if (dosageSpecText != null)
            {
                dosageSpecText.text = string.IsNullOrEmpty(info.DosageSpec)
                    ? string.Empty
                    : $"剂量规格： {info.DosageSpec}";
            }

            if (progressPercentText != null)
            {
                var clampedProgress = Mathf.Clamp01(info.Progress);
                var percent = Mathf.RoundToInt(clampedProgress * 100f);
                progressPercentText.text = $"{percent}%";
            }

            // Update progress bar with smooth animation
            if (progressFillImage != null)
            {
                targetProgressValue = info.Progress;
                if (progressAnimRoutine == null)
                {
                    progressAnimRoutine = StartCoroutine(AnimateProgressBar());
                }
            }
            
            // Load and display drug image if available and different from current
            EZLog.V(EZLog.Module.UI, $"UpdateDispenseUI - drugImage={drugImage != null}, ImageResourceId='{info.ImageResourceId}', currentId='{currentDrugImageId}'");
            if (drugImage != null && !string.IsNullOrEmpty(info.ImageResourceId))
            {
                if (currentDrugImageId != info.ImageResourceId)
                {
                    EZLog.D(EZLog.Module.UI, $"Loading new drug image: {info.ImageResourceId}");
                    currentDrugImageId = info.ImageResourceId;
                    LoadDrugImageAsync(info.ImageResourceId);
                }
            }
            else if (drugImage == null)
            {
                EZLog.W(EZLog.Module.UI, "drugImage field is not assigned in Inspector");
            }
            
            // Update next medicine preview info
            UpdateNextMedicinePreview(info);
            
        }
        
        /// <summary>
        /// Updates the next medicine preview text with info about the upcoming medicine
        /// </summary>
        private void UpdateNextMedicinePreview(DispensingProgressInfo info)
        {
            if (nextMedicineText == null) return;

            if (!nextMedicineText.gameObject.activeSelf)
            {
                nextMedicineText.gameObject.SetActive(true);
            }
            
            if (!string.IsNullOrEmpty(info.NextMedicineName))
            {
                nextMedicineText.text = $"下一药物：{info.NextMedicineName}，共 {info.NextMedicinePillCount} 粒";
            }
            else
            {
                nextMedicineText.text = "下一药物：无";
            }
        }
        
        // Currently loaded drug image ID to avoid reloading same image
        private string currentDrugImageId;
        
        /// <summary>
        /// Load and display drug image from server
        /// </summary>
        private async void LoadDrugImageAsync(string imageResourceId)
        {
            if (drugImage == null || string.IsNullOrEmpty(imageResourceId))
            {
                return;
            }
            
            var serverUrl = AppConfig.Instance?.ServerUrl;
            if (string.IsNullOrEmpty(serverUrl))
            {
                EZLog.W(EZLog.Module.UI, "Cannot load drug image - server URL not configured");
                return;
            }
            
            var texture = await EZDose.UI.PillImageLoader.LoadImageAsync(serverUrl, imageResourceId);
            if (texture != null)
            {
                // Check if this is still the image we want to display
                if (currentDrugImageId == imageResourceId)
                {
                    // Convert Texture2D to Sprite for Image component
                    var sprite = Sprite.Create(
                        texture, 
                        new UnityEngine.Rect(0, 0, texture.width, texture.height), 
                        new Vector2(0.5f, 0.5f));
                    drugImage.sprite = sprite;
                    EZLog.D(EZLog.Module.UI, $"Displayed drug image: {imageResourceId}");
                }
                else
                {
                    // Image changed while loading, destroy this texture
                    Destroy(texture);
                }
            }
        }

        /// <summary>
        /// Smoothly animates the progress bar towards the target value.
        /// </summary>
        private IEnumerator AnimateProgressBar()
        {
            const float smoothSpeed = 5f; // Adjust for faster/slower animation
            
            while (progressFillImage != null)
            {
                float current = progressFillImage.fillAmount;
                float target = targetProgressValue;
                
                // If close enough to target, snap to it
                if (Mathf.Abs(target - current) < 0.001f)
                {
                    progressFillImage.fillAmount = target;
                    yield return null;
                    continue;
                }
                
                // Smoothly interpolate towards target
                progressFillImage.fillAmount = Mathf.Lerp(current, target, Time.deltaTime * smoothSpeed);
                yield return null;
            }
            
            progressAnimRoutine = null;
        }

        private void OnPlateSwitchRequired(int plateNumber)
        {
            var main = MainController.Instance;
            string patientName = "";
            if (main != null && main.GetCurrentPatient() != null)
            {
                patientName = main.GetCurrentPatient().PatientName;
            }

            string plateName = plateNumber == 1 ? "饭前药盒" : "饭后/随餐药盒";

            var targetText = plateSwitchDialogText ?? FindDialogMessageText(plateSwitchDialog, "Message");
            if (targetText != null)
            {
                targetText.text = $"请放入【{patientName}】的【{plateName}】。";
            }

            if (plateSwitchDialog != null)
            {
                plateSwitchDialog.SetActive(true);
            }

            if (plateSwitchConfirmButton != null)
            {
                plateSwitchConfirmButton.onClick.RemoveAllListeners();
                plateSwitchConfirmButton.onClick.AddListener(() =>
                {
                    main?.ConfirmPlateReady();
                    if (plateSwitchDialog != null)
                    {
                        plateSwitchDialog.SetActive(false);
                    }
                });
            }
        }

        private void OnDispenseCompleted()
        {
            FireAndForget(ShowCompletionAsync());
        }

        private void OnServoAngleChangedBySystem(float angle)
        {
            if (servoAngleTuningSlider != null)
            {
                servoAngleTuningSlider.value = angle;
            }
        }

        private void SetCompletionDialogMessage(string message)
        {
            if (completeDialogMessageText == null && completeDialog != null)
            {
                completeDialogMessageText = completeDialog
                    .GetComponentsInChildren<Text>(true)
                    .FirstOrDefault(text => text != null &&
                                            !string.IsNullOrEmpty(text.text) &&
                                            text.text.Contains("取出药盒"));
            }

            if (completeDialogMessageText != null)
            {
                completeDialogMessageText.text = message;
            }
        }

        private void BeginCompletionRfidMonitoring(DispenserController dispenser)
        {
            EndCompletionRfidMonitoring();
            completionDispenser = dispenser;
            completionRfidPresenceVersion = 0;

            if (completionDispenser != null)
            {
                completionDispenser.OnRfidPresenceReported += OnCompletionRfidPresenceReported;
            }
        }

        private void EndCompletionRfidMonitoring()
        {
            if (completionDispenser != null)
            {
                completionDispenser.OnRfidPresenceReported -= OnCompletionRfidPresenceReported;
            }

            completionDispenser = null;
            completionRfidPresenceVersion = 0;
            completionRfidReportTcs?.TrySetResult(false);
            completionRfidReportTcs = null;
        }

        private void OnCompletionRfidPresenceReported(bool isPresent, string _)
        {
            if (isPresent)
            {
                completionRfidPresenceVersion++;
            }
            completionRfidReportTcs?.TrySetResult(true);
        }

        private async Task<bool> WaitForNextCompletionRfidReportAsync()
        {
            if (completionDispenser == null)
            {
                return false;
            }

            var waiter = new TaskCompletionSource<bool>();
            completionRfidReportTcs = waiter;
            var received = await waiter.Task;
            if (ReferenceEquals(completionRfidReportTcs, waiter))
            {
                completionRfidReportTcs = null;
            }

            return received && completionDispenser != null;
        }

        private async Task<bool> WaitForCompletionTrayClearAsync()
        {
            if (completionDispenser == null)
            {
                SetCompletionDialogMessage("无法读取药盒在位状态，轨道不会收回，请检查设备连接");
                return false;
            }

            SetCompletionDialogMessage(completionDispenser.IsRfidCardPresent
                ? "检测到药盒仍在轨道上，请先取出药盒"
                : "正在确认轨道是否为空，请稍候...");

            while (completionDispenser != null)
            {
                // Never trust a state cached before the user confirmed. A fresh
                // hardware report is required so an early NO CARD cannot close the
                // tray before a delayed UID report arrives.
                if (!await WaitForNextCompletionRfidReportAsync())
                {
                    return false;
                }

                if (completionDispenser.IsRfidCardPresent)
                {
                    SetCompletionDialogMessage("检测到药盒仍在轨道上，请先取出药盒");
                    continue;
                }

                // Require the empty state to remain stable before issuing CLOSE_TRAY.
                // Any delayed UID during this window keeps the tray open.
                int presenceVersionBeforeStability = completionRfidPresenceVersion;
                await Task.Delay(CompletionRfidClearStabilityMilliseconds);
                if (completionDispenser == null)
                {
                    return false;
                }

                if (!completionDispenser.IsRfidCardPresent &&
                    completionRfidPresenceVersion == presenceVersionBeforeStability)
                {
                    return true;
                }

                SetCompletionDialogMessage(completionDispenser.IsRfidCardPresent
                    ? "检测到药盒仍在轨道上，请先取出药盒"
                    : "药盒状态发生变化，正在重新确认轨道是否为空...");
            }

            return false;
        }

        private CheckPillBoxController EnsureBarcodeRemovalScanner()
        {
            if (scanner == null)
            {
                scanner = FindObjectOfType<CheckPillBoxController>();
            }

            if (scanner == null)
            {
                scanner = gameObject.AddComponent<CheckPillBoxController>();
                EZLog.I(EZLog.Module.UI, "Created barcode scanner for completion tray monitoring");
            }

            return scanner;
        }

        private void EnableCompletionRetryButton()
        {
            if (completeDialogConfirmButton == null)
            {
                return;
            }

            completeDialogConfirmButton.gameObject.SetActive(true);
            completeDialogConfirmButton.interactable = true;
            completeDialogConfirmButton.onClick.RemoveAllListeners();
            completeDialogConfirmButton.onClick.AddListener(() => FireAndForget(ReturnHomeAsync()));
        }

        private async Task ShowCompletionAsync()
        {
            var main = MainController.Instance;
            bool usesRfid = main != null && main.CurrentPillBoxUsesRfid;
            var dispenser = FindObjectOfType<DispenserController>();
            EZLog.I(EZLog.Module.UI,
                $"Showing completion flow for {(usesRfid ? "RFID" : "Barcode")} pill box");
            if (usesRfid)
            {
                BeginCompletionRfidMonitoring(dispenser);
            }
            else
            {
                EndCompletionRfidMonitoring();
                pillCounterController?.StopCamera();
                // Give Unity/Android a short window to release the native camera
                // before the barcode scanner opens the same physical device.
                await Task.Delay(250);
                EnsureBarcodeRemovalScanner();
            }

            if (main != null)
            {
                // StartDispensingAsync normally opens the tray before publishing the
                // completion event. The barcode branch can immediately monitor that
                // state. Keep the existing RFID reopen/report cycle unchanged.
                bool trayAlreadyOpen = dispenser != null && dispenser.IsTrayOpened;
                if (usesRfid || !trayAlreadyOpen)
                {
                    var opened = await main.OpenTrayAsync();
                    if (!opened)
                    {
                        EZLog.E(EZLog.Module.UI, "Unable to open tray for pill-box removal");
                        EndCompletionRfidMonitoring();
                        return;
                    }
                }
                else
                {
                    EZLog.I(EZLog.Module.UI, "Tray is already open; skipping duplicate OPEN_TRAY command");
                }
            }

            SetCompletionDialogMessage(usesRfid
                ? "请取出药盒后按下确认键"
                : "请取出二维码/条形码药盒，摄像头确认药盒离开后轨道将自动收回");
            if (completeDialog != null)
            {
                completeDialog.SetActive(true);
            }

            if (completeDialogConfirmButton != null)
            {
                completeDialogConfirmButton.onClick.RemoveAllListeners();
                completeDialogConfirmButton.gameObject.SetActive(usesRfid);
                completeDialogConfirmButton.interactable = usesRfid;
                if (usesRfid)
                {
                    completeDialogConfirmButton.onClick.AddListener(() => FireAndForget(ReturnHomeAsync()));
                }
            }

            // Match the proven pre-RFID camera flow: monitoring starts as soon as
            // the tray is open and closes it automatically after the code has been
            // absent continuously for three seconds. No extra confirmation is needed.
            if (!usesRfid)
            {
                await ReturnHomeAsync();
            }
        }

        private async Task ReturnHomeAsync()
        {
            if (isReturningHomeAfterCompletion)
            {
                return;
            }

            isReturningHomeAfterCompletion = true;
            if (completeDialogConfirmButton != null)
            {
                completeDialogConfirmButton.interactable = false;
            }

            try
            {
                var main = MainController.Instance;
                bool usesRfid = main != null && main.CurrentPillBoxUsesRfid;
                if (usesRfid)
                {
                    EZLog.I(EZLog.Module.UI, "Completion removal check using RFID reports");
                    if (!await WaitForCompletionTrayClearAsync())
                    {
                        return;
                    }
                }
                else
                {
                    EZLog.I(EZLog.Module.UI, "Completion removal check using barcode camera");
                    var barcodeScanner = EnsureBarcodeRemovalScanner();
                    SetCompletionDialogMessage(
                        $"请取出二维码/条形码药盒；连续 {BarcodeRemovalStabilitySeconds:F1} 秒检测不到条码后轨道将自动收回");
                    bool barcodeRemoved = await barcodeScanner.WaitForNoBarcodeAsync(BarcodeRemovalStabilitySeconds);
                    barcodeScanner.StopScanner();
                    if (!barcodeRemoved)
                    {
                        EZLog.W(EZLog.Module.UI,
                            "Barcode camera could not confirm pill-box removal; keeping tray open");
                        SetCompletionDialogMessage("摄像头检测失败，轨道保持打开。请检查摄像头后按确认键重试");
                        EnableCompletionRetryButton();
                        return;
                    }
                }

                SetCompletionDialogMessage("正在收回轨道...");
                if (main != null)
                {
                    EZLog.I(EZLog.Module.UI, "Pill box removed; sending CLOSE_TRAY");
                    var closed = await main.CloseTrayAsync();
                    if (!closed)
                    {
                        EZLog.E(EZLog.Module.UI, "CLOSE_TRAY failed after pill-box removal");
                        SetCompletionDialogMessage("轨道收回失败，请检查设备后重新确认");
                        EnableCompletionRetryButton();
                        return;
                    }
                    EZLog.I(EZLog.Module.UI, "CLOSE_TRAY succeeded after pill-box removal");
                }
                else
                {
                    EZLog.E(EZLog.Module.UI,
                        "MainController unavailable; cannot close tray after pill-box removal");
                    SetCompletionDialogMessage("无法连接主控制流程，轨道保持打开，请重启应用后检查设备");
                    EnableCompletionRetryButton();
                    return;
                }

                EndCompletionRfidMonitoring();
                await LoadSceneAsyncSafe(homeSceneName);
            }
            finally
            {
                isReturningHomeAfterCompletion = false;
                if (!deviceLostDialogVisible && completeDialogConfirmButton != null)
                {
                    completeDialogConfirmButton.interactable = true;
                }
            }
        }

        private void ShowDispenseError(string message)
        {
            EZLog.W(EZLog.Module.UI, $"Dispense error: {message}");
            // For now, we show the same completion dialog style with the error message logged.
            if (completeDialog != null)
            {
                completeDialog.SetActive(true);
            }
        }

        #endregion

        #region Helpers

        private bool HandleGlobalDialogShortcuts()
        {
            if (IsActive(deviceLostDialog))
            {
                ShortcutInput.InvokeButtonIfKeyDown(deviceLostConfirmButton, KeyCode.Return, KeyCode.KeypadEnter);
                return true;
            }

            if (IsActive(stalledDialog)) return true;

            return false;
        }

        private void HandleHomeShortcuts()
        {
            if (deviceManagerUI != null && deviceManagerUI.IsDialogVisible())
            {
                return;
            }

            // Treat the pill-box identification dialog as modal. Enter should only
            // confirm after verification has made the existing confirm button usable,
            // and Home-page shortcuts must not fire behind the dialog.
            if (IsActive(homeScanDialog))
            {
                ShortcutInput.InvokeButtonIfKeyDown(
                    homeScanConfirmButton,
                    KeyCode.Return,
                    KeyCode.KeypadEnter);
                return;
            }

            if (ShortcutInput.GetAnyKeyDown(KeyCode.Space))
            {
                if (!isStartingPatientFlow && !isStartingAutoFlow)
                {
                    FireAndForget(StartAutoRecognitionFlowAsync());
                    return;
                }
            }

            if (ShortcutInput.InvokeButtonIfKeyDown(refreshButton, KeyCode.R))
            {
                return;
            }

            if (ShortcutInput.InvokeButtonIfKeyDown(manageDevicesButton, KeyCode.D))
            {
                return;
            }

            if (ShortcutInput.InvokeButtonIfKeyDown(cleanTurntableButton, KeyCode.C))
            {
                return;
            }

            if (ShortcutInput.GetAnyKeyDown(KeyCode.Alpha1, KeyCode.Keypad1))
            {
                ShowSubPage(HomeSubPage.PatientCard);
                return;
            }

            if (ShortcutInput.GetAnyKeyDown(KeyCode.Alpha2, KeyCode.Keypad2))
            {
                ShowSubPage(HomeSubPage.Setting);
            }
        }

        private void HandleScanShortcuts()
        {
            if (IsActive(correctBoxDialog))
            {
                ShortcutInput.InvokeButtonIfKeyDown(correctDialogConfirmButton, KeyCode.Return, KeyCode.KeypadEnter);
                return;
            }

            if (IsActive(mismatchDialog))
            {
                ShortcutInput.InvokeButtonIfKeyDown(mismatchRetryButton, KeyCode.Return, KeyCode.KeypadEnter);
                return;
            }

            if (ShortcutInput.InvokeButtonIfKeyDown(backToHomeButton, KeyCode.Escape))
            {
                return;
            }

            ShortcutInput.InvokeButtonIfKeyDown(switchCameraButton, KeyCode.LeftShift, KeyCode.RightShift);
        }

        private void HandleDispenseShortcuts()
        {
            if (IsActive(skipConfirmDialog))
            {
                if (ShortcutInput.InvokeButtonIfKeyDown(skipConfirmButton, KeyCode.Return, KeyCode.KeypadEnter))
                {
                    return;
                }

                ShortcutInput.InvokeButtonIfKeyDown(skipCleanTurntableButton, KeyCode.C);
                return;
            }

            if (IsActive(plateSwitchDialog))
            {
                ShortcutInput.InvokeButtonIfKeyDown(plateSwitchConfirmButton, KeyCode.Return, KeyCode.KeypadEnter);
                return;
            }

            if (IsActive(completeDialog))
            {
                ShortcutInput.InvokeButtonIfKeyDown(completeDialogConfirmButton, KeyCode.Return, KeyCode.KeypadEnter);
                return;
            }

            if (HandleServoKeyboardTuning())
            {
                return;
            }

            if (ShortcutInput.InvokeButtonIfKeyDown(pauseResumeButton, KeyCode.Space))
            {
                return;
            }

            ShortcutInput.InvokeButtonIfKeyDown(skipMedicineButton, KeyCode.P);
        }

        private bool HandleServoKeyboardTuning()
        {
            bool leftHeld = Input.GetKey(KeyCode.LeftArrow);
            bool rightHeld = Input.GetKey(KeyCode.RightArrow);
            bool leftPressed = Input.GetKeyDown(KeyCode.LeftArrow);
            bool rightPressed = Input.GetKeyDown(KeyCode.RightArrow);
            bool released = Input.GetKeyUp(KeyCode.LeftArrow) || Input.GetKeyUp(KeyCode.RightArrow);

            if (!leftHeld && !rightHeld)
            {
                if (released && isServoKeyboardTuning)
                {
                    CommitServoKeyboardTuning();
                    return true;
                }

                isServoKeyboardTuning = false;
                servoKeyboardValueChanged = false;
                return released;
            }

            if (!CanUseServoKeyboardTuning())
            {
                ResetServoKeyboardTuningState();
                return leftPressed || rightPressed || released;
            }

            if (!isServoKeyboardTuning)
            {
                isServoKeyboardTuning = true;
                servoKeyboardValueChanged = false;
                nextServoKeyboardStepTime = 0f;
            }

            bool shouldStep = leftPressed || rightPressed || Time.unscaledTime >= nextServoKeyboardStepTime;
            if (!shouldStep)
            {
                return true;
            }

            int direction = 0;
            if (rightHeld && !leftHeld)
            {
                direction = -1;
            }
            else if (leftHeld && !rightHeld)
            {
                direction = 1;
            }

            if (direction != 0 && ApplyServoKeyboardStep(direction))
            {
                servoKeyboardValueChanged = true;
            }

            nextServoKeyboardStepTime = Time.unscaledTime + Mathf.Max(0.01f, servoKeyboardRepeatInterval);
            return true;
        }

        private bool ApplyServoKeyboardStep(int direction)
        {
            if (!CanUseServoKeyboardTuning())
            {
                return false;
            }

            float currentValue = servoAngleTuningSlider.value;
            float nextValue = Mathf.Clamp(
                currentValue + direction * Mathf.Abs(servoKeyboardStep),
                servoAngleTuningSlider.minValue,
                servoAngleTuningSlider.maxValue);

            if (Mathf.Approximately(currentValue, nextValue))
            {
                return false;
            }

            servoAngleTuningSlider.value = nextValue;
            return true;
        }

        private void CommitServoKeyboardTuning()
        {
            if (servoKeyboardValueChanged)
            {
                OnServoAngleTuningReleased();
            }

            ResetServoKeyboardTuningState();
        }

        private void ResetServoKeyboardTuningState()
        {
            isServoKeyboardTuning = false;
            servoKeyboardValueChanged = false;
            nextServoKeyboardStepTime = 0f;
        }

        private bool CanUseServoKeyboardTuning()
        {
            return servoAngleTuningSlider != null &&
                   servoAngleTuningSlider.isActiveAndEnabled &&
                   servoAngleTuningSlider.gameObject.activeInHierarchy &&
                   servoAngleTuningSlider.interactable;
        }

        private static bool IsActive(GameObject target)
        {
            return target != null && target.activeInHierarchy;
        }

        private void SetupDeviceLostDialog()
        {
            if (deviceLostDialog != null)
            {
                deviceLostDialog.SetActive(false);
            }

            if (deviceLostConfirmButton != null)
            {
                deviceLostConfirmButton.onClick.RemoveAllListeners();
                deviceLostConfirmButton.onClick.AddListener(OnDeviceLostConfirmClicked);
            }
        }

        private void OnDeviceLost(string reason)
        {
            EZLog.W(EZLog.Module.UI, $"Device lost: {reason}");
            EndCompletionRfidMonitoring();

            if (deviceLostDialogVisible)
            {
                return;
            }

            deviceLostDialogVisible = true;

            if (deviceLostMessageText != null)
            {
                deviceLostMessageText.text = "设备失联，请重启分药机。";
            }

            if (deviceLostDialog != null)
            {
                deviceLostDialog.SetActive(true);
            }
            else
            {
                FireAndForget(ResetAndReturnHomeAfterDeviceLostAsync());
            }
        }

        private void OnDeviceLostConfirmClicked()
        {
            FireAndForget(ResetAndReturnHomeAfterDeviceLostAsync());
        }

        private async Task ResetAndReturnHomeAfterDeviceLostAsync()
        {
            EndCompletionRfidMonitoring();

            if (deviceLostDialog != null)
            {
                deviceLostDialog.SetActive(false);
            }
            deviceLostDialogVisible = false;

            var main = MainController.Instance;
            if (main != null)
            {
                await main.ResetAfterDeviceLostAsync();
            }

            if (SceneManager.GetActiveScene().name != homeSceneName)
            {
                await LoadSceneAsyncSafe(homeSceneName);
            }
        }

        private void UnsubscribeEvents()
        {
            EndIdentificationSession(stopScanner: true);
            EndCompletionRfidMonitoring();
            if (identificationCoordinator != null)
            {
                identificationCoordinator.Verified -= OnIdentificationVerified;
                identificationCoordinator.Mismatch -= OnIdentificationMismatch;
                identificationCoordinator.UnknownRfid -= OnUnknownRfid;
                identificationCoordinator.RfidRemoved -= OnIdentificationRfidRemoved;
                identificationCoordinator.RfidChanged -= OnIdentificationRfidChanged;
                identificationCoordinator.Conflict -= OnIdentificationConflict;
                identificationCoordinator = null;
            }

            var main = MainController.Instance;
            if (main != null)
            {
                main.PatientsUpdated -= RenderPatientButtons;
                main.DispensingProgressChanged -= UpdateDispenseUI;
                main.DispensingError -= ShowDispenseError;
                main.DispensingCompleted -= OnDispenseCompleted;
                main.ServoAngleChanged -= OnServoAngleChangedBySystem;
                main.PlateSwitchRequired -= OnPlateSwitchRequired;
                main.MedicineSkipped -= OnMedicineSkipped;
                main.MotorStallChanged -= OnMotorStallChanged;
                main.SkipConfirmRequired -= OnSkipConfirmRequired;
                main.DeviceLost -= OnDeviceLost;
            }

            if (scanner != null)
            {
                scanner.OnBoxVerified -= OnBoxVerified;
                scanner.OnBoxMismatch -= OnBoxMismatch;
                scanner.OnScanError -= OnScanError;
            }

            var dispenser = FindObjectOfType<DispenserController>();
            if (dispenser != null)
            {
                dispenser.OnConnectionStateChanged -= OnDispenserConnectionChanged;
                dispenser.OnPauseStateChanged -= UpdatePauseButtonUI;
            }

            if (lightBarRoutine != null)
            {
                StopCoroutine(lightBarRoutine);
            }
        }

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
                    EZLog.E(EZLog.Module.UI, $"Async error: {e.Message}");
                }
            }

            Wrapper();
        }

        /// <summary>
        /// Awaitable wrapper for Unity scene loading.
        /// </summary>
        private static async Task LoadSceneAsyncSafe(string sceneName)
        {
            var op = SceneManager.LoadSceneAsync(sceneName);
            if (op == null)
            {
                EZLog.E(EZLog.Module.UI, $"Failed to load scene: {sceneName}");
                return;
            }

            while (!op.isDone)
            {
                await Task.Yield();
            }
        }

        /// <summary>
        /// 判断药品时间是否属于饭后/随餐/任意时间
        /// </summary>
        private bool IsAfterMealTiming(string timing)
        {
            if (string.IsNullOrEmpty(timing)) return false;
            return string.Equals(timing, "after", StringComparison.OrdinalIgnoreCase)
                || string.Equals(timing, "after_meal", StringComparison.OrdinalIgnoreCase)
                || string.Equals(timing, "with_meal", StringComparison.OrdinalIgnoreCase)
                || string.Equals(timing, "anytime", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// 寻找弹窗内的 Message 文本组件的辅助方法
        /// </summary>
        private Text FindDialogMessageText(GameObject dialog, string defaultNamePattern)
        {
            if (dialog == null) return null;
            var texts = dialog.GetComponentsInChildren<Text>(true);
            
            // 1. 优先寻找命名中包含特定关键字的组件 (如 "Message", "Content", "Body")
            var matchingByName = texts.FirstOrDefault(t => t.name.IndexOf(defaultNamePattern, StringComparison.OrdinalIgnoreCase) >= 0);
            if (matchingByName != null) return matchingByName;
            
            // 2. 备选方案：寻找第一个不属于 Button 按钮子物体的 Text 组件
            return texts.FirstOrDefault(t => t.GetComponentInParent<Button>() == null);
        }

        #endregion
    }
}
