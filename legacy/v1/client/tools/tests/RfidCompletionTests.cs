using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using EZDose.Hardware;

/* PRODUCTION_MONITOR */

namespace EZDose
{
    public static class EZLog
    {
        public enum Module { UI, Dispenser }
        public static void I(Module module, string message) { }
        public static void W(Module module, string message) { }
        public static void E(Module module, string message) { }
    }
}

namespace EZDose.Hardware
{
    public class DispenserController
    {
        private string currentRfidUid;
        private bool isRfidCardPresent;
        public RfidRemovalMonitor RfidRemoval { get; }
        public bool IsConnected = true;
        public bool IsTrayOpened = true;
        public event Action<bool, string> OnRfidPresenceReported;
        public event Action<string, string> OnRfidCardChanged;
        public event Action<string> OnRfidCardPlaced;
        public event Action<string> OnRfidCardRemoved;
        public DispenserController(Func<double> clock) { RfidRemoval = new RfidRemovalMonitor(clock); }
        public void Uid() { HandleRfidUid("00123456"); }
        public void NoCard() { HandleRfidNoCard(); }
        public void ResetForOpen() { ClearRfidStateWithoutEvent(); }
        public void Disconnect() { IsConnected = false; ClearRfidStateWithoutEvent(); }
        /* PRODUCTION_DEVICE_METHODS */
    }
}

namespace EZDose.UI
{
    public class View
    {
        public bool active;
        public void SetActive(bool active) { this.active = active; }
    }
    public class ClickEvent
    {
        private Action handler;
        public void RemoveAllListeners() { handler = null; }
        public void AddListener(Action handler) { this.handler += handler; }
        public void Click() { handler?.Invoke(); }
    }
    public class Button
    {
        public View gameObject = new View();
        public bool interactable;
        public ClickEvent onClick = new ClickEvent();
    }
    public class CheckPillBoxController
    {
        public int WaitCount;
        public bool Removed = true;
        public void StopScanner() { }
        public Task<bool> WaitForNoBarcodeAsync(float seconds) { WaitCount++; return Task.FromResult(Removed); }
    }
    public class Counter { public void StopCamera() { } }
    public class MainController
    {
        public static MainController Instance;
        public bool CurrentPillBoxUsesRfid = true;
        public int OpenCount, CloseCount;
        public bool CloseSucceeds = true;
        public bool OpenSucceeds = true;
        public Action OnOpen;
        public TaskCompletionSource<bool> OpenGate;
        public TaskCompletionSource<bool> CloseGate;
        public DispenserController Device;
        public Task<bool> OpenTrayAsync()
        {
            OpenCount++;
            Device.ResetForOpen();
            OnOpen?.Invoke(); // A hardware report can arrive before OPEN_TRAY completes.
            Device.IsTrayOpened = OpenSucceeds;
            return OpenGate?.Task ?? Task.FromResult(OpenSucceeds);
        }
        public Task<bool> CloseTrayAsync()
        {
            CloseCount++;
            if (CloseSucceeds) { Device.IsTrayOpened = false; Device.ResetForOpen(); }
            return CloseGate?.Task ?? Task.FromResult(CloseSucceeds);
        }
    }
    public class UIManager
    {
        private DispenserController completionDispenser;
        private int completionRfidMonitoringSession;
        private bool isShowingCompletion;
        private bool isReturningHomeAfterCompletion;
        private bool deviceLostDialogVisible;
        private int completionRfidClearStabilityMilliseconds = 1500;
        /* PRODUCTION_STABILITY_PROPERTY */
        private float BarcodeRemovalStabilitySeconds => 1.5f;
        private Counter pillCounterController = new Counter();
        private string homeSceneName = "Home";
        public Button completeDialogConfirmButton = new Button();
        public View completeDialog = new View();
        public CheckPillBoxController scanner = new CheckPillBoxController();
        public bool HomeLoaded;
        public string Message;
        public bool DeviceLookupAvailable = true;
        public void SetStabilityMilliseconds(int milliseconds) { completionRfidClearStabilityMilliseconds = milliseconds; }
        public Task Show() { return ShowCompletionAsync(); }
        public Task Retry() { return ReturnHomeAsync(); }
        public void DeviceLost() { deviceLostDialogVisible = true; EndCompletionRfidMonitoring(); }
        public void CancelMonitoring() { EndCompletionRfidMonitoring(); }
        private T FindObjectOfType<T>() where T : class { return DeviceLookupAvailable ? MainController.Instance.Device as T : null; }
        private CheckPillBoxController EnsureBarcodeRemovalScanner() { return scanner; }
        private void SetCompletionDialogMessage(string message) { Message = message; }
        private Task LoadSceneAsyncSafe(string scene) { HomeLoaded = true; return Task.CompletedTask; }
        public Task ButtonTask;
        private void FireAndForget(Task task) { ButtonTask = task; }
        /* PRODUCTION_UI_METHODS */
    }
}

namespace EZDose.Regression
{
    public static class RfidCompletionTests
    {
        private static int passed;
        private sealed class Fixture
        {
            public double Seconds;
            public DispenserController Device;
            public UI.MainController Main;
            public UI.UIManager UI = new UI.UIManager();
            public Fixture()
            {
                Device = new DispenserController(() => Seconds);
                Main = new UI.MainController { Device = Device };
                EZDose.UI.MainController.Instance = Main;
            }
        }
        private static void Assert(bool condition, string message)
        {
            if (!condition) throw new Exception(message);
        }
        private static async Task Complete(Task task)
        {
            Assert(await Task.WhenAny(task, Task.Delay(3000)) == task, "Completion timed out");
            await task;
        }
        private static async Task Unclosed(Fixture f)
        {
            await Task.Delay(100);
            Assert(f.Main.CloseCount == 0, "Tray closed before stable removal");
        }
        private static void Pass(string name) { passed++; Console.WriteLine("PASS " + name); }

        public static async Task RunAsync()
        {
            var f = new Fixture();
            f.Seconds = 100;
            Assert(!f.Device.RfidRemoval.IsClearFor(1500), "Default empty is not a hardware report");
            f.Device.NoCard();
            f.Seconds = 101.499;
            Assert(!f.Device.RfidRemoval.IsClearFor(1500), "1499ms must not close");
            f.Seconds = 101.501;
            Assert(f.Device.RfidRemoval.IsClearFor(1500), "Stable NO CARD should be accepted");
            f.Device.ResetForOpen();
            Assert(!f.Device.RfidRemoval.HasReport && !f.Device.RfidRemoval.IsClearFor(1500), "New opening resets old reports");
            Pass("opening reset and stable-time boundary");

            f = new Fixture();
            var flow = f.UI.Show();
            Assert(f.UI.completeDialog.active && !f.UI.completeDialogConfirmButton.gameObject.active, "RFID should show dialog without confirmation");
            f.Seconds = 20;
            await Unclosed(f);
            f.Device.NoCard();
            f.Seconds = 21.501;
            await Complete(flow);
            Assert(f.Main.CloseCount == 1 && f.UI.HomeLoaded, "One report must automatically close and return home");
            Pass("automatic start, unknown state and one-shot NO CARD");

            f = new Fixture();
            f.Device.NoCard(); // Arrives before the dialog subscribes or waits.
            f.Seconds = 1;
            flow = f.UI.Show();
            await Unclosed(f);
            f.Seconds = 1.499;
            await Unclosed(f);
            f.Seconds = 1.501;
            await Complete(flow);
            Assert(f.Main.CloseCount == 1 && f.Main.OpenCount == 0, "Early report must survive without duplicate opening");
            Pass("early NO CARD before dialog, with remaining stability delay");

            f = new Fixture();
            f.Device.NoCard();
            f.Seconds = 3;
            await Complete(f.UI.Show());
            Assert(f.Main.CloseCount == 1, "Already-stable early report must not require another report");
            Pass("already-stable NO CARD before waiter creation");

            f = new Fixture();
            f.Device.IsTrayOpened = false;
            f.Main.OnOpen = () => f.Device.NoCard();
            flow = f.UI.Show();
            await Unclosed(f);
            f.Seconds = 1.501;
            await Complete(flow);
            Assert(f.Main.OpenCount == 1 && f.Main.CloseCount == 1, "Report during OPEN_TRAY must be retained");
            Pass("NO CARD during opening acknowledgement");

            f = new Fixture();
            flow = f.UI.Show();
            f.Device.NoCard();
            f.Seconds = 1;
            f.Device.Uid();
            f.Seconds = 10;
            await Unclosed(f);
            f.Device.NoCard();
            f.Seconds = 11.499;
            await Unclosed(f);
            f.Seconds = 11.501;
            await Complete(flow);
            Pass("UID interrupts stability; new NO CARD restarts the full interval");

            f = new Fixture();
            flow = f.UI.Show();
            f.Device.NoCard();
            f.Seconds = 1;
            f.Device.NoCard();
            f.Seconds = 1.501;
            await Complete(flow);
            Assert(f.Main.CloseCount == 1, "Repeated empty reports must not postpone closing");
            Pass("repeated NO CARD does not restart stability");

            f = new Fixture();
            flow = f.UI.Show();
            f.Device.NoCard();
            f.Seconds = 1;
            f.Device.Uid();
            f.Device.NoCard(); // Both transitions happen between UI polling intervals.
            f.Seconds = 1.501;
            await Unclosed(f);
            f.Seconds = 2.499;
            await Unclosed(f);
            f.Seconds = 2.501;
            await Complete(flow);
            Pass("UID and NO CARD between polling intervals are both recorded");

            f = new Fixture();
            flow = f.UI.Show();
            f.Device.NoCard();
            f.Device.Disconnect();
            f.Seconds = 5;
            await Complete(flow);
            Assert(f.Main.CloseCount == 0 && f.UI.completeDialogConfirmButton.gameObject.active, "Disconnect must keep tray open with retry");
            f.Device.IsConnected = true;
            flow = f.UI.Retry();
            await Unclosed(f);
            f.Device.NoCard();
            f.Seconds = 6.501;
            await Complete(flow);
            Assert(f.Main.CloseCount == 1, "Retry must require a new report after disconnect");
            Pass("disconnect resets evidence; reconnect retry revalidates removal");

            f = new Fixture();
            flow = f.UI.Show();
            f.Device.NoCard();
            f.UI.DeviceLost();
            f.Seconds = 5;
            await Complete(flow);
            Assert(f.Main.CloseCount == 0 && !f.UI.HomeLoaded, "Cancelled monitor must never close or navigate");
            Pass("device-loss cancellation prevents delayed closure");

            f = new Fixture();
            f.Device.NoCard();
            f.Seconds = 2;
            f.Main.CloseSucceeds = false;
            await Complete(f.UI.Show());
            Assert(f.Main.CloseCount == 1 && !f.UI.HomeLoaded && f.UI.completeDialogConfirmButton.gameObject.active, "Close failure must retain completion and retry");
            f.Main.CloseSucceeds = true;
            f.Device.Uid();
            flow = f.UI.Retry();
            var duplicate = f.UI.Retry();
            await Complete(duplicate);
            await Task.Delay(100);
            Assert(f.Main.CloseCount == 1, "Retry cannot bypass a reinserted box");
            f.Device.NoCard();
            f.Seconds = 3.501;
            await Complete(flow);
            Assert(f.Main.CloseCount == 2 && f.UI.HomeLoaded, "Only one retry should close after removal");
            Pass("failed close, reinserted box and duplicate retry");

            f = new Fixture();
            flow = f.UI.Show();
            var duplicateCompletion = f.UI.Show();
            f.Device.NoCard();
            f.Seconds = 2;
            await Complete(Task.WhenAll(flow, duplicateCompletion));
            Assert(f.Main.CloseCount == 1 && f.UI.HomeLoaded, "Repeated completion notification must not cancel the active monitor");
            Pass("duplicate completion notification keeps one active removal flow");

            f = new Fixture();
            f.Device.IsTrayOpened = false;
            f.Main.OpenGate = new TaskCompletionSource<bool>();
            f.Main.OnOpen = () => f.Device.NoCard();
            flow = f.UI.Show();
            duplicateCompletion = f.UI.Show();
            f.Seconds = 2;
            f.Main.OpenGate.SetResult(true);
            await Complete(Task.WhenAll(flow, duplicateCompletion));
            Assert(f.Main.OpenCount == 1 && f.Main.CloseCount == 1, "Duplicate notification during opening must not reopen or lose early NO CARD");
            Pass("duplicate completion during opening acknowledgement");

            f = new Fixture();
            f.UI.DeviceLookupAvailable = false;
            await Complete(f.UI.Show());
            Assert(f.Main.CloseCount == 0 && f.UI.completeDialogConfirmButton.gameObject.active, "Missing RFID controller must retain a usable retry entry");
            f.UI.DeviceLookupAvailable = true;
            flow = f.UI.Retry();
            await Unclosed(f);
            f.Device.NoCard();
            f.Seconds = 2;
            await Complete(flow);
            Assert(f.Main.CloseCount == 1, "Retry must resume RFID detection after controller becomes available");
            Pass("missing controller retains retry and revalidates removal");

            f = new Fixture();
            f.UI.SetStabilityMilliseconds(0);
            f.Device.NoCard();
            flow = f.UI.Show();
            f.Seconds = 1;
            await Unclosed(f);
            f.Seconds = 1.501;
            await Complete(flow);
            Assert(f.Main.CloseCount == 1, "Invalid Inspector setting must still enforce 1500ms stability");
            Pass("invalid stability setting cannot shorten the 1.5-second interval");

            f = new Fixture();
            f.Device.IsTrayOpened = false;
            f.Main.OpenSucceeds = false;
            await Complete(f.UI.Show());
            Assert(f.Main.CloseCount == 0 && f.UI.completeDialog.active && f.UI.completeDialogConfirmButton.gameObject.active,
                "Failed opening must display a retry without closing");
            f.Main.OpenSucceeds = true;
            f.Main.OnOpen = () => f.Device.NoCard();
            f.UI.completeDialogConfirmButton.onClick.Click();
            f.Seconds = 2;
            await Complete(f.UI.ButtonTask);
            Assert(f.Main.OpenCount == 2 && f.Main.CloseCount == 1 && f.UI.HomeLoaded,
                "Opening retry must open again and then detect stable removal");
            Pass("failed opening retries opening before automatic removal detection");

            f = new Fixture();
            f.Device.IsTrayOpened = false;
            f.Main.OpenGate = new TaskCompletionSource<bool>();
            f.Main.OnOpen = () => f.Device.NoCard();
            flow = f.UI.Show();
            f.UI.CancelMonitoring(); // A scene unload cancels before OPEN_TRAY returns.
            f.Seconds = 2;
            f.Main.OpenGate.SetResult(true);
            await Complete(flow);
            Assert(f.Main.CloseCount == 0 && !f.UI.HomeLoaded, "Late opening callback must not revive a cancelled flow");
            Pass("scene cancellation during opening ignores the late acknowledgement");

            f = new Fixture();
            f.Device.NoCard();
            f.Seconds = 2;
            f.Main.CloseGate = new TaskCompletionSource<bool>();
            flow = f.UI.Show();
            Assert(f.Main.CloseCount == 1, "Stable removal should initiate closing");
            f.UI.DeviceLost();
            f.Main.CloseGate.SetResult(true);
            await Complete(flow);
            Assert(!f.UI.HomeLoaded, "Late close acknowledgement must not navigate past device-loss handling");
            Pass("late close acknowledgement preserves device-loss handling");

            f = new Fixture();
            f.Main.CurrentPillBoxUsesRfid = false;
            f.UI.scanner.Removed = false;
            await Complete(f.UI.Show());
            Assert(f.Main.CloseCount == 0 && f.UI.completeDialogConfirmButton.gameObject.active,
                "Camera failure must keep the tray open");
            f.UI.scanner.Removed = true;
            await Complete(f.UI.Retry());
            Assert(f.Main.CloseCount == 1 && f.UI.scanner.WaitCount == 2,
                "Camera retry must use the camera again");
            Pass("camera failure and retry remain isolated from RFID");

            f = new Fixture();
            f.Main.CurrentPillBoxUsesRfid = false;
            await Complete(f.UI.Show());
            Assert(f.UI.scanner.WaitCount == 1 && f.Main.CloseCount == 1 && f.Main.OpenCount == 0, "Barcode must retain automatic camera completion");
            Pass("barcode automatic completion remains isolated");
            Console.WriteLine(passed + " RFID completion regression scenarios passed.");
        }
    }
}
