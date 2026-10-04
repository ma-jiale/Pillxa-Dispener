using System;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace EZDose.Calibration
{
    /// <summary>
    /// Manages dispenser settings (motor speed and servo angle) calibration.
    /// Directly calculates motor speed and servo angle from lower optocoupler pulse width.
    /// </summary>
    public class PillCalibrationManager : MonoBehaviour
    {
        // Dispenser settings range
        public const float MIN_MOTOR_SPEED = 0.1f;
        public const float MAX_MOTOR_SPEED = 1.4f;
        public const float MIN_SERVO_ANGLE = 0.1f;
        public const float MAX_SERVO_ANGLE = 1.0f;

        [Header("动态优化开关与门槛")]
        [Tooltip("是否启用基于脉冲宽度的动态参数优化。若未勾选/关闭，则始终使用默认参数 (motor=0.3, servo=0.7)")]
        [SerializeField] private bool enablePulseOptimization = false;

        [Tooltip("单次分药最少收集的脉冲样本数。少于此粒数时跳过参数优化更新（默认7粒）")]
        [SerializeField] private int minSamplesForOptimization = 7;

        [Header("默认回退参数 (未开启优化或未校准时使用)")]
        [SerializeField] private float defaultMotorSpeed = 0.3f;
        [SerializeField] private float defaultServoAngle = 0.7f;

        [Header("脉冲宽度 → 转盘速度计算配置")]
        [Tooltip("基准起始转盘速度（小圆片起步速度）")]
        [SerializeField] private float baseMotorSpeed = 0.15f;

        [Tooltip("基准脉冲宽度（对应起步速度的最小脉冲）")]
        [SerializeField] private float basePulseWidth = 5.0f;

        [Tooltip("转速增长斜率 K_motor: 速度增量 = (PulseWidth - basePulseWidth) × K_motor")]
        [SerializeField] private float kMotorSpeed = 0.010f;

        [Tooltip("允许的最低与最高动态转速范围")]
        [SerializeField] private float minMotorSpeedLimit = 0.15f;
        [SerializeField] private float maxMotorSpeedLimit = 0.36f;

        [Header("脉冲宽度 → 舵机角度计算配置")]
        [Tooltip("基准起始舵机角度（对应小圆片窄开度/大角度）")]
        [SerializeField] private float baseServoAngle = 0.85f;

        [Tooltip("基准脉冲宽度（对应起步舵机角度）")]
        [SerializeField] private float baseServoPulseWidth = 5.0f;

        [Tooltip("常规中小药片递减斜率 K_servo: 中小药片保持原样（默认 0.020）")]
        [SerializeField] private float kServoAngle = 0.020f;

        [Tooltip("大药片与胶囊门槛脉宽（超过此脉宽后快速放大阀门开度，默认 13.0）")]
        [SerializeField] private float largePillPulseThreshold = 13.0f;

        [Tooltip("大药片与胶囊加速开门斜率（让大胶囊快速达到 0.1 全开，默认 0.055）")]
        [SerializeField] private float kServoAngleLarge = 0.055f;

        [Tooltip("允许的最低与最高动态舵机角度范围（0.08近乎全开 ~ 0.98窄缝）")]
        [SerializeField] private float minServoAngleLimit = 0.08f;
        [SerializeField] private float maxServoAngleLimit = 0.98f;

        // Server URL for fetching/saving settings
        private string serverUrl;

        public static PillCalibrationManager Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                if (Application.isPlaying)
                {
                    Destroy(gameObject);
                }
                else
                {
                    DestroyImmediate(gameObject);
                }
                return;
            }

            Instance = this;
            if (Application.isPlaying)
            {
                DontDestroyOnLoad(gameObject);
            }
        }

        // Events
        public event Action<string> OnCalibrationError;

        #region Public Properties

        public bool EnablePulseOptimization
        {
            get => enablePulseOptimization;
            set => enablePulseOptimization = value;
        }

        public int MinSamplesForOptimization
        {
            get => minSamplesForOptimization;
            set => minSamplesForOptimization = value;
        }

        public float DefaultMotorSpeed
        {
            get => defaultMotorSpeed;
            set => defaultMotorSpeed = value;
        }

        public float DefaultServoAngle
        {
            get => defaultServoAngle;
            set => defaultServoAngle = value;
        }

        public float BaseMotorSpeed
        {
            get => baseMotorSpeed;
            set => baseMotorSpeed = value;
        }

        public float BasePulseWidth
        {
            get => basePulseWidth;
            set => basePulseWidth = value;
        }

        public float KMotorSpeed
        {
            get => kMotorSpeed;
            set => kMotorSpeed = value;
        }

        public float MinMotorSpeedLimit
        {
            get => minMotorSpeedLimit;
            set => minMotorSpeedLimit = value;
        }

        public float MaxMotorSpeedLimit
        {
            get => maxMotorSpeedLimit;
            set => maxMotorSpeedLimit = value;
        }

        public float BaseServoAngle
        {
            get => baseServoAngle;
            set => baseServoAngle = value;
        }

        public float BaseServoPulseWidth
        {
            get => baseServoPulseWidth;
            set => baseServoPulseWidth = value;
        }

        public float KServoAngle
        {
            get => kServoAngle;
            set => kServoAngle = value;
        }

        public float LargePillPulseThreshold
        {
            get => largePillPulseThreshold;
            set => largePillPulseThreshold = value;
        }

        public float KServoAngleLarge
        {
            get => kServoAngleLarge;
            set => kServoAngleLarge = value;
        }

        public float MinServoAngleLimit
        {
            get => minServoAngleLimit;
            set => minServoAngleLimit = value;
        }

        public float MaxServoAngleLimit
        {
            get => maxServoAngleLimit;
            set => maxServoAngleLimit = value;
        }

        #endregion

        #region Initialization

        /// <summary>
        /// Initialize the calibration manager with server URL.
        /// </summary>
        public void Initialize(string serverUrl)
        {
            this.serverUrl = serverUrl?.TrimEnd('/') ?? string.Empty;
        }

        #endregion

        #region Dispenser Settings Calculation

        /// <summary>
        /// Calculate dispenser motor speed and servo angle from median pulse width.
        /// MotorSpeed = Clamp(baseMotorSpeed + (pulseWidth - basePulseWidth) * kMotorSpeed, minLimit, maxLimit)
        /// ServoAngle uses piecewise calculation:
        /// - Small & Medium pills (pulseWidth <= 13): keeps original gentle slope (0.85 -> 0.69)
        /// - Large pills & Capsules (pulseWidth > 13): steep opening slope down to 0.10 for large capsules
        /// </summary>
        /// <param name="pulseWidth">Median optocoupler pulse width</param>
        /// <returns>Tuple of (motorSpeed, servoAngle)</returns>
        public (float motorSpeed, float servoAngle) CalculateSettingsFromPulseWidth(float pulseWidth)
        {
            float motorSpeed = Mathf.Clamp(
                baseMotorSpeed + (pulseWidth - basePulseWidth) * kMotorSpeed,
                minMotorSpeedLimit,
                maxMotorSpeedLimit
            );

            float servoAngle;
            if (pulseWidth <= largePillPulseThreshold)
            {
                // 常规中小药片：保持原样温和微调
                servoAngle = baseServoAngle - (pulseWidth - baseServoPulseWidth) * kServoAngle;
            }
            else
            {
                // 大药片与胶囊：快速放大阀门开度，大胶囊迅速拉到 0.10 全开
                float angleAtThreshold = baseServoAngle - (largePillPulseThreshold - baseServoPulseWidth) * kServoAngle;
                servoAngle = angleAtThreshold - (pulseWidth - largePillPulseThreshold) * kServoAngleLarge;
            }

            servoAngle = Mathf.Clamp(servoAngle, minServoAngleLimit, maxServoAngleLimit);

            EZLog.D(EZLog.Module.Calibration, $"Pulse width {pulseWidth:F1} -> motor={motorSpeed:F2}, servo={servoAngle:F2}");
            return (motorSpeed, servoAngle);
        }

        /// <summary>
        /// Get dispenser settings for a given prescription.
        /// If dynamic pulse optimization is disabled, returns default settings (defaultMotorSpeed, defaultServoAngle).
        /// Otherwise returns saved settings if valid (>0), or default settings if uncalibrated.
        /// </summary>
        public (float motorSpeed, float servoAngle) GetSettingsOrDefault(float savedMotorSpeed, float savedServoAngle)
        {
            if (!enablePulseOptimization)
            {
                EZLog.D(EZLog.Module.Calibration, $"Pulse optimization disabled. Using default settings (motor={defaultMotorSpeed:F2}, servo={defaultServoAngle:F2})");
                return (defaultMotorSpeed, defaultServoAngle);
            }

            if (savedMotorSpeed > 0 && savedServoAngle > 0)
            {
                return (savedMotorSpeed, savedServoAngle);
            }

            EZLog.D(EZLog.Module.Calibration, $"Using default settings for uncalibrated prescription (motor={defaultMotorSpeed:F2}, servo={defaultServoAngle:F2})");
            return (defaultMotorSpeed, defaultServoAngle);
        }

        #endregion

        #region Server Communication

        /// <summary>
        /// Update dispenser settings (motor speed and servo angle) for a prescription on the server.
        /// </summary>
        public async Task<bool> UpdateDispenserSettingsOnServerAsync(int prescriptionId, float motorSpeed, float servoAngle)
        {
            var url = string.IsNullOrEmpty(serverUrl) ? AppConfig.Instance?.ServerUrl : serverUrl;
            url = url?.TrimEnd('/');

            if (string.IsNullOrEmpty(url))
            {
                EZLog.E(EZLog.Module.Calibration, "Server URL not set for dispenser settings update");
                return false;
            }

            try
            {
                var payload = new DispenserSettingsUpdatePayload
                {
                    motor_speed = motorSpeed,
                    servo_angle = servoAngle
                };
                var json = JsonUtility.ToJson(payload);
                var body = System.Text.Encoding.UTF8.GetBytes(json);

                using (var request = new UnityWebRequest($"{url}/packer/prescription/{prescriptionId}/dispenser-settings", "POST"))
                {
                    request.certificateHandler = new BypassCertificateHandler();
                    request.uploadHandler = new UploadHandlerRaw(body);
                    request.downloadHandler = new DownloadHandlerBuffer();
                    request.SetRequestHeader("Content-Type", "application/json");
                    request.timeout = 10;

                    var op = request.SendWebRequest();
                    while (!op.isDone)
                    {
                        await Task.Yield();
                    }

                    if (request.result != UnityWebRequest.Result.Success)
                    {
                        EZLog.E(EZLog.Module.Calibration, $"Failed to update dispenser settings: {request.error}");
                        return false;
                    }

                    EZLog.I(EZLog.Module.Calibration, $"Updated prescription {prescriptionId} settings: motor={motorSpeed:.2f}, servo={servoAngle:.2f}");
                    return true;
                }
            }
            catch (Exception e)
            {
                EZLog.E(EZLog.Module.Calibration, "Exception updating dispenser settings", e);
                return false;
            }
        }

        /// <summary>
        /// Update dispenser settings and optionally upload pill image for a prescription on the server.
        /// Uses multipart/form-data to upload motor_speed, servo_angle and image file.
        /// </summary>
        public async Task<(bool success, string imageResourceId)> UpdateSettingsWithImageAsync(
            int prescriptionId,
            float motorSpeed,
            float servoAngle,
            byte[] imageBytes)
        {
            var url = string.IsNullOrEmpty(serverUrl) ? AppConfig.Instance?.ServerUrl : serverUrl;
            url = url?.TrimEnd('/');

            if (string.IsNullOrEmpty(url))
            {
                EZLog.E(EZLog.Module.Calibration, "Server URL not set for calibration update");
                return (false, null);
            }

            try
            {
                var form = new WWWForm();
                form.AddField("motor_speed", motorSpeed.ToString("F2"));
                form.AddField("servo_angle", servoAngle.ToString("F2"));

                if (imageBytes != null && imageBytes.Length > 0)
                {
                    form.AddBinaryData("pill_image", imageBytes, "pill_image.jpg", "image/jpeg");
                    EZLog.D(EZLog.Module.Calibration, $"Uploading pill image: {imageBytes.Length} bytes");
                }

                using (var request = UnityWebRequest.Post($"{url}/packer/prescription/{prescriptionId}/calibration", form))
                {
                    request.certificateHandler = new BypassCertificateHandler();
                    request.timeout = 30;

                    var op = request.SendWebRequest();
                    while (!op.isDone)
                    {
                        await Task.Yield();
                    }

                    if (request.result != UnityWebRequest.Result.Success)
                    {
                        EZLog.E(EZLog.Module.Calibration, $"Failed to update calibration: {request.error}");
                        return (false, null);
                    }

                    var response = JsonUtility.FromJson<CalibrationUpdateResponse>(request.downloadHandler.text);
                    if (response != null && response.success)
                    {
                        EZLog.I(EZLog.Module.Calibration, $"Updated prescription {prescriptionId}: motor={motorSpeed:.2f}, servo={servoAngle:.2f}, image={response.image_resource_id ?? "none"}");
                        return (true, response.image_resource_id);
                    }

                    EZLog.W(EZLog.Module.Calibration, $"Server returned error: {request.downloadHandler.text}");
                    return (false, null);
                }
            }
            catch (Exception e)
            {
                EZLog.E(EZLog.Module.Calibration, "Exception updating calibration", e);
                return (false, null);
            }
        }

        #endregion

        #region JSON Data Classes

        [Serializable]
        private class DispenserSettingsUpdatePayload
        {
            public float motor_speed;
            public float servo_angle;
        }

        [Serializable]
        private class CalibrationUpdateResponse
        {
            public bool success;
            public string message;
            public string image_resource_id;
        }

        #endregion
    }
}
