// Compile the real PrescriptionManager without launching Unity or connecting hardware.
// The small Unity stand-ins below only replace serialization and network transport.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using EZDose.Prescriptions;

internal static class PrescriptionDateTests
{
    private static readonly DateTime Today = DateTime.Today;
    private static int passed;

    private static string Day(int offset)
    {
        return Today.AddDays(offset).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static PrescriptionRecord Record(int start, int duration, int? expiry, int id = 1)
    {
        return new PrescriptionRecord {
            id = id, patient_id = "000001", patient_name = "Test",
            medicine_name = "Same medicine", morning_dosage = 1,
            meal_timing = "before", start_date = Day(start), duration_days = duration,
            last_dispensed_expiry_date = expiry.HasValue ? Day(expiry.Value) : null,
            is_active = 1
        };
    }

    private static PrescriptionManager Manager(params PrescriptionRecord[] records)
    {
        var manager = new PrescriptionManager("https://example.invalid/dispenser");
        typeof(PrescriptionManager).GetField("allRecords", BindingFlags.Instance | BindingFlags.NonPublic)
            .SetValue(manager, records.ToList());
        return manager;
    }

    private static void Expect(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    private static DispensingMedicine Plan(PrescriptionManager manager, int maxDays, int threshold)
    {
        DispensingPlan plan;
        Expect(manager.TryGenerateDispensingPlan("000001", maxDays, threshold, out plan), "Plan failed");
        return plan.MedicinesPlate1.Concat(plan.MedicinesPlate2).SingleOrDefault();
    }

    private static void CheckPlan(string name, int start, int duration, int? expiry,
        int expectedStart, int expectedDays, int maxDays = 7, int threshold = 2)
    {
        var record = Record(start, duration, expiry);
        var manager = Manager(record);
        var medicine = Plan(manager, maxDays, threshold);
        if (expectedDays == 0)
        {
            Expect(medicine == null, name + ": unnecessary dispensing");
        }
        else
        {
            Expect(medicine != null, name + ": missing medicine");
            Expect(medicine.DispensingStartDate == Day(expectedStart), name + ": wrong first day");
            Expect(medicine.DispensingDays == expectedDays, name + ": wrong quantity");
            for (int column = 0; column < 7; column++)
                Expect(medicine.PillMatrix[2, column] == (column < expectedDays ? 1 : 0),
                    name + ": matrix does not match the planned days");
            Expect(manager.ApplyDispensingResult(medicine.PrescriptionId, medicine.MedicineName,
                medicine.DispensingDays, medicine.DispensingStartDate), name + ": result rejected");
            Expect(record.last_dispensed_expiry_date == Day(expectedStart + expectedDays - 1),
                name + ": wrong uploaded expiry");
        }
        Console.WriteLine("PASS " + name);
        passed++;
    }

    public static int Main()
    {
        try
        {
            CheckPlan("late first dispensing starts today", -15, 90, null, 0, 7);
            CheckPlan("gap after previous dispensing stays unfilled", -30, 90, -12, 0, 7);
            CheckPlan("continuous dispensing starts today", -30, 90, -1, 0, 7);
            CheckPlan("existing future coverage is preserved", -30, 90, 1, 2, 7);
            CheckPlan("late first dispensing stops at prescription end", -10, 13, null, 0, 3);
            CheckPlan("gap near prescription end reduces quantity", -10, 13, -5, 0, 3);
            CheckPlan("expired prescription is skipped", -10, 10, null, 0, 0);
            CheckPlan("fully covered prescription is skipped", -10, 13, 2, 0, 0);
            CheckPlan("threshold is preserved", -10, 90, 4, 0, 0);
            CheckPlan("future prescription never starts early", 2, 90, null, 2, 7);
            CheckPlan("hardware capacity remains seven days", -10, 90, null, 0, 7, 30);

            var original = Record(-30, 90, -12);
            var sameName = Record(-30, 90, -12, 2);
            var manager = Manager(original, sameName);
            DispensingPlan plan;
            manager.TryGenerateDispensingPlan("000001", 7, 2, out plan);
            var medicine = plan.MedicinesPlate1.First(m => m.PrescriptionId == 1);
            Expect(!manager.ApplyDispensingResult(1, medicine.MedicineName, 0, Day(0)), "Accepted zero days");
            Expect(!manager.ApplyDispensingResult(1, medicine.MedicineName, 8, Day(0)), "Accepted eight days");
            Expect(!manager.ApplyDispensingResult(1, medicine.MedicineName, 7, null), "Accepted missing dates");
            Expect(original.last_dispensed_expiry_date == Day(-12), "Rejected input changed coverage");
            passed++;
            Console.WriteLine("PASS invalid result leaves coverage unchanged");

            // Simulate a plan made yesterday that only finishes today.
            Expect(manager.ApplyDispensingResult(1, medicine.MedicineName, 7, Day(-1)), "Overnight result rejected");
            Expect(original.last_dispensed_expiry_date == Day(5), "Overnight result shifted by one day");
            Expect(sameName.last_dispensed_expiry_date == Day(-12), "Same-name prescription changed");
            passed++;
            Console.WriteLine("PASS frozen dates and prescription identity survive result writing");

            Expect(manager.PushAllChangesAsync().GetAwaiter().GetResult(), "Upload failed");
            var payload = UnityEngine.JsonUtility.LastSerializedObject;
            var uploaded = (List<PrescriptionRecord>)payload.GetType().GetField("prescriptions").GetValue(payload);
            Expect(uploaded.Single(r => r.id == 1).last_dispensed_expiry_date == Day(5), "Wrong upload payload");
            Expect(UnityEngine.Networking.UnityWebRequest.LastUrl.EndsWith("/packer/prescriptions/upload"),
                "Wrong upload endpoint");
            passed++;
            Console.WriteLine("PASS upload receives the corrected prescription dates");
            Console.WriteLine(passed + " date regression cases passed.");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }
}

internal static class AppConfig { public const int MAX_SUPPORTED_DISPENSING_DAYS = 7; }
internal sealed class BypassCertificateHandler { }
internal static class EZLog
{
    public enum Module { Prescription }
    public static void D(Module module, string message) { }
    public static void E(Module module, string message) { }
    public static void I(Module module, string message) { }
    public static void W(Module module, string message) { }
}

namespace UnityEngine
{
    internal static class JsonUtility
    {
        public static object LastSerializedObject;
        public static string ToJson(object value) { LastSerializedObject = value; return "{}"; }
        public static T FromJson<T>(string json)
        {
            var response = Activator.CreateInstance(typeof(T), true);
            typeof(T).GetField("success").SetValue(response, true);
            return (T)response;
        }
    }
}

namespace UnityEngine.Networking
{
    internal sealed class UploadHandlerRaw { public UploadHandlerRaw(byte[] data) { } }
    internal sealed class DownloadHandlerBuffer { public string text = "{}"; }
    internal sealed class PendingRequest { public bool isDone = true; }
    internal sealed class UnityWebRequest : IDisposable
    {
        public const string kHttpVerbPOST = "POST";
        public static string LastUrl;
        public enum Result { Success }
        public Result result = Result.Success;
        public string error = "";
        public object certificateHandler;
        public UploadHandlerRaw uploadHandler;
        public DownloadHandlerBuffer downloadHandler = new DownloadHandlerBuffer();
        public int timeout;
        public UnityWebRequest(string url, string method) { LastUrl = url; }
        public static UnityWebRequest Get(string url) { return new UnityWebRequest(url, "GET"); }
        public void SetRequestHeader(string name, string value) { }
        public PendingRequest SendWebRequest() { return new PendingRequest(); }
        public void Dispose() { }
    }
}
