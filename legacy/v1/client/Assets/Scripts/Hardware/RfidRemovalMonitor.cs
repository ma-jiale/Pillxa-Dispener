using System;
using System.Diagnostics;

namespace EZDose.Hardware
{
    /// <summary>RFID observations for one tray-opening cycle, independent of the UI.</summary>
    public sealed class RfidRemovalMonitor
    {
        private readonly Func<double> monotonicSeconds;
        private double? emptySince;

        public bool HasReport { get; private set; }
        public bool IsPresent { get; private set; }

        public RfidRemovalMonitor(Func<double> monotonicSeconds = null)
        {
            this.monotonicSeconds = monotonicSeconds ??
                (() => (double)Stopwatch.GetTimestamp() / Stopwatch.Frequency);
        }

        public void Reset()
        {
            HasReport = false;
            IsPresent = false;
            emptySince = null;
        }

        public void Report(bool isPresent)
        {
            HasReport = true;
            IsPresent = isPresent;
            if (isPresent)
            {
                emptySince = null;
            }
            else if (!emptySince.HasValue)
            {
                // Preserve a single early NO CARD and don't restart on repeated reports.
                emptySince = monotonicSeconds();
            }
        }

        public bool IsClearFor(int milliseconds)
        {
            return emptySince.HasValue &&
                   (monotonicSeconds() - emptySince.Value) * 1000 >= Math.Max(0, milliseconds);
        }
    }
}
