using System;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// Firefox native messaging host for YT Power Toys.
// Pushes the Windows default output device's master volume (0..1, as shown on the
// Windows volume slider) and mute state to the extension whenever either changes.
static class VolumeHost
{
    const int ERender = 0, EConsole = 0, ClsctxAll = 23;
    const int PollMs = 250;

    static readonly Stream Stdout = Console.OpenStandardOutput();

    static void Main()
    {
        // Firefox closes stdin when the extension disconnects; exit with it.
        new Thread(() =>
        {
            var stdin = Console.OpenStandardInput();
            var buffer = new byte[4096];
            while (stdin.Read(buffer, 0, buffer.Length) > 0) { }
            Environment.Exit(0);
        }) { IsBackground = true }.Start();

        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
        string last = null;
        while (true)
        {
            // The default endpoint is re-read every poll so switching output devices
            // (e.g. plugging in headphones) is picked up.
            string message = ReadVolume(enumerator);
            if (message != last)
            {
                Send(message);
                last = message;
            }
            Thread.Sleep(PollMs);
        }
    }

    static string ReadVolume(IMMDeviceEnumerator enumerator)
    {
        IMMDevice device = null;
        object endpoint = null;
        try
        {
            int hr = enumerator.GetDefaultAudioEndpoint(ERender, EConsole, out device);
            if (hr != 0) return Error("No default audio output device", hr);

            Guid iid = typeof(IAudioEndpointVolume).GUID;
            hr = device.Activate(ref iid, ClsctxAll, IntPtr.Zero, out endpoint);
            if (hr != 0) return Error("Cannot open the output device volume", hr);

            var volume = (IAudioEndpointVolume)endpoint;
            float level;
            bool muted;
            hr = volume.GetMasterVolumeLevelScalar(out level);
            if (hr != 0) return Error("Cannot read the volume", hr);
            hr = volume.GetMute(out muted);
            if (hr != 0) return Error("Cannot read the mute state", hr);

            return string.Format(CultureInfo.InvariantCulture,
                "{{\"volume\":{0:0.00},\"muted\":{1}}}", level, muted ? "true" : "false");
        }
        finally
        {
            if (endpoint != null) Marshal.ReleaseComObject(endpoint);
            if (device != null) Marshal.ReleaseComObject(device);
        }
    }

    static string Error(string text, int hr)
    {
        return "{\"error\":\"" + text + " (0x" + hr.ToString("X8") + ")\"}";
    }

    // Native messaging framing: 32-bit native-endian length, then UTF-8 JSON.
    static void Send(string json)
    {
        byte[] payload = Encoding.UTF8.GetBytes(json);
        Stdout.Write(BitConverter.GetBytes(payload.Length), 0, 4);
        Stdout.Write(payload, 0, payload.Length);
        Stdout.Flush();
    }
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumerator { }

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator
{
    [PreserveSig] int EnumAudioEndpoints(); // unused, keeps the vtable slot
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice
{
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams,
        [MarshalAs(UnmanagedType.IUnknown)] out object instance);
}

[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume
{
    // Unused methods keep their vtable slots, in declaration order.
    [PreserveSig] int RegisterControlChangeNotify();
    [PreserveSig] int UnregisterControlChangeNotify();
    [PreserveSig] int GetChannelCount();
    [PreserveSig] int SetMasterVolumeLevel();
    [PreserveSig] int SetMasterVolumeLevelScalar();
    [PreserveSig] int GetMasterVolumeLevel();
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    [PreserveSig] int SetChannelVolumeLevel();
    [PreserveSig] int SetChannelVolumeLevelScalar();
    [PreserveSig] int GetChannelVolumeLevel();
    [PreserveSig] int GetChannelVolumeLevelScalar();
    [PreserveSig] int SetMute();
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
}
