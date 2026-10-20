using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace EZDose.Prescriptions
{
    [Serializable]
    public class PrescriptionRecord
    {
        // Raw record exactly as returned by the server
        // Fields must match JSON keys from /packer/prescriptions endpoint
        public int id;                              // Prescription ID (auto-increment primary key)
        public string patient_id;                   // Foreign key to patients table (6-digit zero-padded)
        public string patient_name;                 // Joined from patients table
        public string bed_number;                   // Joined from patients table
        public string medicine_name;
        public float morning_dosage;                // Dosages are REAL in SQLite
        public float noon_dosage;
        public float evening_dosage;
        public string meal_timing;                  // before/after/anytime
        public string start_date;                   // Format: YYYY-MM-DD
        public int duration_days;
        public string last_dispensed_expiry_date;  // Format: YYYY-MM-DD
        public int is_active;                       // 0 = inactive, 1 = active
        public float pill_size_area;                // 药片面积 mm² (0 = uncalibrated)
        public float motor_speed;                   // 转盘速度 (0 = uncalibrated)
        public float servo_angle;                   // 舵机角度 (0 = uncalibrated)
        public string image_resource_id;            // Medicine image filename
        public string dosage_spec;                  // 剂量规格
        public string created_at;                   // Timestamp
    }

    [Serializable]
    internal class PrescriptionListResponse
    {
        public bool success;
        public List<PrescriptionRecord> data;
        public string message;
    }

    [Serializable]
    public class PillBoxRecord
    {
        public int id;
        public string patient_id;
        public string rfid_uid;
        public string box_type;
        public string display_name;
        public int is_active;
        public string patient_name;
        public string bed_number;
    }

    [Serializable]
    internal class PillBoxListResponse
    {
        public bool success;
        public List<PillBoxRecord> data;
        public string message;
    }

    [Serializable]
    internal class UploadPayload
    {
        public List<PrescriptionRecord> prescriptions;
    }

    [Serializable]
    internal class UploadResponse
    {
        public bool success;
        public string message;
    }

    [Serializable]
    public class PatientInfo
    {
        // Basic patient identifiers
        public string PatientName;
        public string PatientId;
        public string BedNumber;
    }

    [Serializable]
    public class MedicineEntry
    {
        // One medicine with daily dosage info
        public int PrescriptionId;                  // Server-side prescription ID for updates
        public string MedicineName;
        public float MorningDosage;                 // Changed to float to match server REAL type
        public float NoonDosage;
        public float EveningDosage;
        public string MealTiming;                   // before/after/anytime
        public string StartDate;
        public int DurationDays;
        public string LastDispensedExpiryDate;
        public bool IsActive;
        public float PillSizeArea;                   // 药片面积 mm² (0 = uncalibrated)
        public float MotorSpeed;                     // 转盘速度 (0 = uncalibrated)
        public float ServoAngle;                     // 舵机角度 (0 = uncalibrated)
        public string ImageResourceId;               // Pill image filename from server
        public string DosageSpec;                    // 剂量规格

        // Helpers to check when to take the pill based on meal_timing field
        public bool IsBeforeMeal => string.Equals(MealTiming, "before", StringComparison.OrdinalIgnoreCase) || 
                                    string.Equals(MealTiming, "before_meal", StringComparison.OrdinalIgnoreCase);
        public bool IsAfterMeal => string.Equals(MealTiming, "after", StringComparison.OrdinalIgnoreCase) || 
                                   string.Equals(MealTiming, "after_meal", StringComparison.OrdinalIgnoreCase) ||
                                   string.Equals(MealTiming, "anytime", StringComparison.OrdinalIgnoreCase) ||
                                   string.Equals(MealTiming, "with_meal", StringComparison.OrdinalIgnoreCase);
    }

    [Serializable]
    public class PrescriptionData
    {
        // Patient plus the list of active medicines
        public PatientInfo Patient;
        public List<MedicineEntry> Medicines;
    }

    [Serializable]
    public class DispensingMedicine
    {
        // A medicine ready to be placed on a plate with its 4x7 matrix
        public int PrescriptionId;                  // Server ID for updating after calibration
        public string MedicineName;
        public string MealTiming;
        public float PillSizeArea;                  // 药片面积 mm² (0 = uncalibrated)
        public float MotorSpeed;                    // 转盘速度 (0 = uncalibrated)
        public float ServoAngle;                    // 舵机角度 (0 = uncalibrated)
        public int DispensingDays;
        public string DispensingStartDate;          // Frozen when this medicine's plan is created
        public int[,] PillMatrix;
        
        // Patient info for calibration dialog display
        public string PatientName;
        public string BedNumber;
        
        // Medicine image filename from server
        public string ImageResourceId;
        public string DosageSpec;                    // 剂量规格
    }

    [Serializable]
    public class DispensingPlan
    {
        // Plate 1 = before/anytime meal, Plate 2 = after meal
        public PatientInfo Patient;
        public List<DispensingMedicine> MedicinesPlate1 = new List<DispensingMedicine>();
        public List<DispensingMedicine> MedicinesPlate2 = new List<DispensingMedicine>();
    }

    public class PrescriptionManager
    {
        private readonly string serverUrl;
        private readonly CultureInfo culture = CultureInfo.InvariantCulture;
        private List<PrescriptionRecord> allRecords = new List<PrescriptionRecord>();
        private List<PillBoxRecord> pillBoxRecords = new List<PillBoxRecord>();
        private readonly Dictionary<string, string> patientIdByRfidUid =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        private PrescriptionData currentPrescription;
        public PrescriptionManager(string serverUrl)
        {
            this.serverUrl = (serverUrl ?? string.Empty).TrimEnd('/');
        }

        public IReadOnlyList<PrescriptionRecord> CachedRecords => allRecords;
        public IReadOnlyList<PillBoxRecord> CachedPillBoxes => pillBoxRecords;

        public bool TryGetPatientIdByRfidUid(string uid, out string patientId)
        {
            patientId = null;
            if (string.IsNullOrWhiteSpace(uid))
            {
                return false;
            }

            return patientIdByRfidUid.TryGetValue(uid.Trim().ToUpperInvariant(), out patientId);
        }

        public bool UpdateDispenserSettingsLocally(int prescriptionId, string medicineName, float motorSpeed, float servoAngle)
        {
            if (motorSpeed <= 0 || servoAngle <= 0)
            {
                return false;
            }

            var updated = false;
            var hasPrescriptionId = prescriptionId > 0;

            if (currentPrescription?.Medicines != null)
            {
                foreach (var medicine in currentPrescription.Medicines)
                {
                    if (MatchesPrescription(medicine.PrescriptionId, medicine.MedicineName, prescriptionId, medicineName, hasPrescriptionId))
                    {
                        medicine.MotorSpeed = motorSpeed;
                        medicine.ServoAngle = servoAngle;
                        updated = true;
                    }
                }
            }

            if (allRecords != null)
            {
                foreach (var record in allRecords)
                {
                    if (MatchesPrescription(record.id, record.medicine_name, prescriptionId, medicineName, hasPrescriptionId))
                    {
                        record.motor_speed = motorSpeed;
                        record.servo_angle = servoAngle;
                        updated = true;
                    }
                }
            }

            return updated;
        }

        public bool UpdatePillSizeAreaLocally(int prescriptionId, string medicineName, float pillSizeAreaMm2)
        {
            if (pillSizeAreaMm2 <= 0)
            {
                return false;
            }

            var updated = false;
            var hasPrescriptionId = prescriptionId > 0;

            if (currentPrescription?.Medicines != null)
            {
                foreach (var medicine in currentPrescription.Medicines)
                {
                    if (MatchesPrescription(medicine.PrescriptionId, medicine.MedicineName, prescriptionId, medicineName, hasPrescriptionId))
                    {
                        medicine.PillSizeArea = pillSizeAreaMm2;
                        updated = true;
                    }
                }
            }

            if (allRecords != null)
            {
                foreach (var record in allRecords)
                {
                    if (MatchesPrescription(record.id, record.medicine_name, prescriptionId, medicineName, hasPrescriptionId))
                    {
                        record.pill_size_area = pillSizeAreaMm2;
                        updated = true;
                    }
                }
            }

            return updated;
        }

        public async Task<bool> RefreshFromServerAsync()
        {
            // Pull all prescriptions from the server; no local files are used
            if (string.IsNullOrEmpty(serverUrl))
            {
                EZLog.E(EZLog.Module.Prescription, "Server URL is empty");
                return false;
            }

            using (var request = UnityWebRequest.Get($"{serverUrl}/packer/prescriptions"))
            {
                request.certificateHandler = new BypassCertificateHandler();
                request.timeout = 10;
                await Wait(request);

                if (request.result != UnityWebRequest.Result.Success)
                {
                    EZLog.E(EZLog.Module.Prescription, $"Fetch failed: {request.error}");
                    return false;
                }

                var response = JsonUtility.FromJson<PrescriptionListResponse>(request.downloadHandler.text);
                if (response != null && response.success)
                {
                    allRecords = response.data ?? new List<PrescriptionRecord>();
                }
                else
                {
                    EZLog.E(EZLog.Module.Prescription, $"Server rejected fetch: {request.downloadHandler.text}");
                    return false;
                }
            }

            // RFID bindings are optional for backward compatibility with older servers.
            await RefreshPillBoxesFromServerAsync();
            return true;
        }

        private async Task RefreshPillBoxesFromServerAsync()
        {
            using (var request = UnityWebRequest.Get($"{serverUrl}/packer/pill-boxes"))
            {
                request.certificateHandler = new BypassCertificateHandler();
                request.timeout = 10;
                await Wait(request);

                if (request.result != UnityWebRequest.Result.Success)
                {
                    pillBoxRecords.Clear();
                    patientIdByRfidUid.Clear();
                    EZLog.W(EZLog.Module.Prescription, $"RFID pill-box mapping fetch failed; camera scanning remains available: {request.error}");
                    return;
                }

                var response = JsonUtility.FromJson<PillBoxListResponse>(request.downloadHandler.text);
                if (response == null || !response.success)
                {
                    pillBoxRecords.Clear();
                    patientIdByRfidUid.Clear();
                    EZLog.W(EZLog.Module.Prescription, $"RFID pill-box mapping response was invalid: {request.downloadHandler.text}");
                    return;
                }

                pillBoxRecords = response.data ?? new List<PillBoxRecord>();
                patientIdByRfidUid.Clear();
                foreach (var box in pillBoxRecords)
                {
                    if (box == null || box.is_active == 0 ||
                        string.IsNullOrWhiteSpace(box.rfid_uid) || string.IsNullOrWhiteSpace(box.patient_id))
                    {
                        continue;
                    }

                    patientIdByRfidUid[box.rfid_uid.Trim().ToUpperInvariant()] = box.patient_id.Trim();
                }

                EZLog.I(EZLog.Module.Prescription, $"Loaded {patientIdByRfidUid.Count} RFID pill-box bindings");
            }
        }

        public bool TryGetPatientPrescription(string patientId, out PrescriptionData result)
        {
            result = null;
            
            // Find patient by ID (6-digit zero-padded format)
            if (string.IsNullOrWhiteSpace(patientId))
            {
                return false;
            }

            var key = patientId.Trim();
            
            // Match records by patient_id field
            var records = allRecords.Where(r =>
                !string.IsNullOrEmpty(r.patient_id) && 
                string.Equals(r.patient_id.Trim(), key, StringComparison.OrdinalIgnoreCase)
            ).ToList();

            if (records.Count == 0)
            {
                return false;
            }

            // Only keep active medicines (is_active = 1)
            var activeRecords = records.Where(r => r.is_active != 0).ToList();
            if (activeRecords.Count == 0)
            {
                return false;
            }

            var first = activeRecords[0];
            var patient = new PatientInfo
            {
                PatientName = first.patient_name,
                PatientId = first.patient_id
            };

            var medicines = activeRecords.Select(ToMedicine).ToList();

            result = new PrescriptionData
            {
                Patient = patient,
                Medicines = medicines
            };
            return true;
        }

        /// <summary>
        /// Generate a dispensing plan with pill matrices for the hardware.
        /// Separates medicines into Plate1 (before/anytime meal) and Plate2 (after meal).
        /// Only includes medicines that need dispensing based on expiryThreshold.
        /// </summary>
        /// <param name="patientId">Patient ID (6-digit zero-padded)</param>
        /// <param name="maxDays">Maximum number of days to dispense (typically 7)</param>
        /// <param name="expiryThreshold">Only dispense if remaining pills <= this many days</param>
        /// <param name="plan">Output dispensing plan with plate assignments</param>
        /// <returns>True if plan was successfully generated</returns>
        public bool TryGenerateDispensingPlan(string patientId, int maxDays, int expiryThreshold, out DispensingPlan plan)
        {
            plan = null;
            
            // Build 4x7 matrices for each medicine for the next few days
            if (!TryGetPatientPrescription(patientId, out var prescription))
            {
                return false;
            }

            currentPrescription = prescription;
            var hasBefore = prescription.Medicines.Any(m => m.IsBeforeMeal);
            var hasAfter = prescription.Medicines.Any(m => m.IsAfterMeal);

            var dispensingPlan = new DispensingPlan
            {
                Patient = prescription.Patient
            };

            var today = DateTime.Today;
            foreach (var medicine in prescription.Medicines)
            {
                // Calculate how many days we still need to dispense, considering threshold
                var dispensingDays = CalculateDispensingDays(
                    medicine, maxDays, expiryThreshold, today, out var dispensingStartDate);
                EZLog.D(EZLog.Module.Prescription, $"Medicine '{medicine.MedicineName}': dispensingDays={dispensingDays}, lastExpiry={medicine.LastDispensedExpiryDate}, threshold={expiryThreshold}");

                if (dispensingDays <= 0)
                {
                    EZLog.D(EZLog.Module.Prescription, $"Skipping '{medicine.MedicineName}' - no dispensing needed");
                    continue;
                }

                var pillMatrix = BuildPillMatrix(medicine, dispensingDays);
                var entry = new DispensingMedicine
                {
                    PrescriptionId = medicine.PrescriptionId,
                    MedicineName = medicine.MedicineName,
                    MealTiming = medicine.MealTiming,
                    PillSizeArea = medicine.PillSizeArea,
                    MotorSpeed = medicine.MotorSpeed,
                    ServoAngle = medicine.ServoAngle,
                    DispensingDays = dispensingDays,
                    DispensingStartDate = dispensingStartDate.ToString("yyyy-MM-dd", culture),
                    PillMatrix = pillMatrix,
                    PatientName = prescription.Patient?.PatientName ?? "",
                    BedNumber = prescription.Patient?.BedNumber ?? "",
                    ImageResourceId = medicine.ImageResourceId,
                    DosageSpec = medicine.DosageSpec
                };

                if (hasBefore && hasAfter)
                {
                    if (medicine.IsAfterMeal)
                    {
                        // After-meal pills go to plate 2
                        dispensingPlan.MedicinesPlate2.Add(entry);
                    }
                    else
                    {
                        // Before/anytime pills go to plate 1
                        dispensingPlan.MedicinesPlate1.Add(entry);
                    }
                }
                else
                {
                    // Only one timing type: everything on plate 1
                    dispensingPlan.MedicinesPlate1.Add(entry);
                }
            }

            plan = dispensingPlan;
            return true;
        }

        public bool ApplyDispensingResult(int prescriptionId, string medicineName, int actualDispensedDays, string dispensingStartDate)
        {
            // Advance the expiry date only by the number of days represented by the
            // matrix that actually completed successfully.
            if (currentPrescription == null)
            {
                return false;
            }

            if (string.IsNullOrWhiteSpace(medicineName))
            {
                return false;
            }

            if (actualDispensedDays < 1 || actualDispensedDays > AppConfig.MAX_SUPPORTED_DISPENSING_DAYS)
            {
                EZLog.E(EZLog.Module.Prescription,
                    $"Refusing to apply invalid dispensed days: {actualDispensedDays}");
                return false;
            }

            var hasPrescriptionId = prescriptionId > 0;
            var medicine = currentPrescription.Medicines.FirstOrDefault(m =>
                MatchesPrescription(m.PrescriptionId, m.MedicineName, prescriptionId, medicineName, hasPrescriptionId));
            if (medicine == null)
            {
                return false;
            }

            // Use the dates frozen in the plan, even if execution finishes after midnight.
            // Adding days to the old expiry would incorrectly fill a missed period.
            if (!DateTime.TryParseExact(dispensingStartDate, "yyyy-MM-dd", culture,
                DateTimeStyles.None, out var firstDate))
            {
                return false;
            }

            var newExpiry = firstDate.AddDays(actualDispensedDays - 1).ToString("yyyy-MM-dd", culture);
            medicine.LastDispensedExpiryDate = newExpiry;

            // Prefer the prescription ID so medicines with the same name cannot update
            // each other's records. Medicine name remains a fallback for legacy data.
            foreach (var record in allRecords.Where(r =>
                string.Equals(r.patient_id, currentPrescription.Patient.PatientId, StringComparison.OrdinalIgnoreCase) &&
                MatchesPrescription(r.id, r.medicine_name, prescriptionId, medicineName, hasPrescriptionId)))
            {
                record.last_dispensed_expiry_date = newExpiry;
            }

            return true;
        }

        public async Task<bool> PushAllChangesAsync()
        {
            // Send the updated prescriptions back to the server
            if (string.IsNullOrEmpty(serverUrl))
            {
                EZLog.E(EZLog.Module.Prescription, "Server URL is empty for upload");
                return false;
            }

            var payload = new UploadPayload
            {
                prescriptions = allRecords
            };

            var json = JsonUtility.ToJson(payload);
            var body = Encoding.UTF8.GetBytes(json);

            using (var request = new UnityWebRequest($"{serverUrl}/packer/prescriptions/upload", UnityWebRequest.kHttpVerbPOST))
            {
                request.certificateHandler = new BypassCertificateHandler();
                request.uploadHandler = new UploadHandlerRaw(body);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.timeout = 30;

                await Wait(request);

                if (request.result != UnityWebRequest.Result.Success)
                {
                    EZLog.E(EZLog.Module.Prescription, $"Upload failed: {request.error}");
                    return false;
                }

                var response = JsonUtility.FromJson<UploadResponse>(request.downloadHandler.text);
                return response != null && response.success;
            }
        }

        private static bool MatchesPrescription(int candidatePrescriptionId, string candidateMedicineName, int prescriptionId, string medicineName, bool hasPrescriptionId)
        {
            if (hasPrescriptionId)
            {
                return candidatePrescriptionId == prescriptionId;
            }

            return !string.IsNullOrWhiteSpace(medicineName) &&
                   string.Equals(candidateMedicineName, medicineName, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Convert raw server record to internal MedicineEntry object.
        /// </summary>
        private static MedicineEntry ToMedicine(PrescriptionRecord record)
        {
            return new MedicineEntry
            {
                PrescriptionId = record.id,         // Preserve server ID for updates
                MedicineName = record.medicine_name,
                MorningDosage = record.morning_dosage,
                NoonDosage = record.noon_dosage,
                EveningDosage = record.evening_dosage,
                MealTiming = record.meal_timing ?? "before",
                StartDate = record.start_date,
                DurationDays = record.duration_days,
                LastDispensedExpiryDate = record.last_dispensed_expiry_date,
                IsActive = record.is_active != 0,
                PillSizeArea = record.pill_size_area,
                MotorSpeed = record.motor_speed,
                ServoAngle = record.servo_angle,
                ImageResourceId = record.image_resource_id,
                DosageSpec = record.dosage_spec
            };
        }

        /// <summary>
        /// Calculate how many days of pills need to be dispensed for a medicine.
        /// Returns 0 if medicine has enough pills remaining (above threshold) or prescription is over.
        /// Uses the same logic as MainController.CountMedicinesNeedingDispensing.
        /// </summary>
        private int CalculateDispensingDays(MedicineEntry medicine, int maxDays, int expiryThreshold,
            DateTime today, out DateTime dispensingStartDate)
        {
            dispensingStartDate = today.Date;
            var effectiveMaxDays = Math.Min(
                Math.Max(0, maxDays),
                AppConfig.MAX_SUPPORTED_DISPENSING_DAYS);

            if (!DateTime.TryParseExact(medicine.StartDate, "yyyy-MM-dd", culture, DateTimeStyles.None, out var start))
            {
                // Without a valid prescription period, we cannot assign coverage dates.
                return 0;
            }

            var expiryDate = DateTime.TryParseExact(medicine.LastDispensedExpiryDate, "yyyy-MM-dd",
                culture, DateTimeStyles.None, out var last) ? last.Date : start.Date.AddDays(-1);
            var endOfPrescription = start.Date.AddDays(medicine.DurationDays); // Exclusive end.
            var daysUntilExpiry = (expiryDate - today.Date).Days + 1;

            if (endOfPrescription <= today.Date || expiryDate >= endOfPrescription.AddDays(-1) ||
                daysUntilExpiry > expiryThreshold)
            {
                return 0;
            }

            // Missed days stay missed: start today, or after existing future coverage.
            // A future prescription must still wait until its own start date.
            dispensingStartDate = new[] { today.Date, start.Date, expiryDate.AddDays(1) }.Max();
            var remainingDays = (endOfPrescription - dispensingStartDate).Days;
            return Math.Min(effectiveMaxDays, Math.Max(0, remainingDays));
        }

        /// <summary>
        /// Build a 4x7 pill matrix for hardware dispensing.
        /// Row order matches nursing home workflow where first meal is lunch:
        /// Physical plate (top to bottom): Noon → Evening → Morning
        /// Matrix mapping: [0]=Morning (bottom), [1]=Evening (middle), [2]=Noon (top), [3]=Spare
        /// Columns: Days 0-6
        /// </summary>
        private static int[,] BuildPillMatrix(MedicineEntry medicine, int dispensingDays)
        {
            var matrix = new int[4, AppConfig.MAX_SUPPORTED_DISPENSING_DAYS];
            var days = Math.Min(dispensingDays, AppConfig.MAX_SUPPORTED_DISPENSING_DAYS);

            for (var day = 0; day < days; day++)
            {
                // Cast float dosages to int for pill counting
                // Server stores as REAL but hardware needs whole pill counts
                // Physical plate order (top to bottom): Noon → Evening → Morning
                // Matrix row 0 = physical bottom, row 2 = physical top
                matrix[2, day] = (int)medicine.MorningDosage;   // 早上 (物理底部, 第三顿)
                matrix[0, day] = (int)medicine.EveningDosage;   // 晚上 (物理中间, 第二顿)
                matrix[1, day] = (int)medicine.NoonDosage;      // 中午 (物理顶部, 第一顿)
            }

            return matrix;
        }

        private static async Task Wait(UnityWebRequest request)
        {
            var op = request.SendWebRequest();
            while (!op.isDone)
            {
                await Task.Yield();
            }
        }
    }
}
