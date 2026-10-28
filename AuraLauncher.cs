using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace AuraIDE {
    public class Wpf32Window : System.Windows.Forms.IWin32Window {
        private IntPtr _handle;
        public Wpf32Window(IntPtr handle) { _handle = handle; }
        public IntPtr Handle { get { return _handle; } }
    }

    public class App : Application {
        private static Process serverProcess = null;

        [DllImport("user32.dll")]
        public static extern bool ReleaseCapture();

        [DllImport("user32.dll")]
        public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        public static extern bool IsZoomed(IntPtr hWnd);

        [DllImport("psapi.dll")]
        public static extern int EmptyWorkingSet(IntPtr hwProc);

        [DllImport("kernel32.dll")]
        public static extern bool SetProcessWorkingSetSize(IntPtr proc, int min, int max);

        public static void TrimHostMemory() {
            try {
                GC.Collect(2, GCCollectionMode.Forced);
                GC.WaitForPendingFinalizers();
                IntPtr hCurrent = Process.GetCurrentProcess().Handle;
                SetProcessWorkingSetSize(hCurrent, -1, -1);
                EmptyWorkingSet(hCurrent);

                if (serverProcess != null && !serverProcess.HasExited) {
                    try {
                        SetProcessWorkingSetSize(serverProcess.Handle, -1, -1);
                        EmptyWorkingSet(serverProcess.Handle);
                    } catch {}
                }
            } catch {}
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        public class MONITORINFO {
            public int cbSize = Marshal.SizeOf(typeof(MONITORINFO));
            public RECT rcMonitor = new RECT();
            public RECT rcWork = new RECT();
            public int dwFlags = 0;
        }

        [DllImport("user32.dll")]
        public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        public static extern bool GetMonitorInfo(IntPtr hMonitor, [In, Out] MONITORINFO lpmi);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

        [DllImport("user32.dll")]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        private const uint MONITOR_DEFAULTTONEAREST = 2;
        private const uint SWP_FRAMECHANGED = 0x0020;
        private const uint SWP_SHOWWINDOW = 0x0040;
        private static readonly IntPtr HWND_TOP = IntPtr.Zero;
        private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        private static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);

        private const int SW_RESTORE = 9;
        private const int SW_MAXIMIZE = 3;

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT { public int X; public int Y; }

        [DllImport("user32.dll")]
        public static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("dwmapi.dll")]
        public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr LoadImage(IntPtr hinst, string lpszName, uint uType, int cxDesired, int cyDesired, uint fuLoad);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool DestroyIcon(IntPtr hIcon);

        private const uint IMAGE_ICON = 1;
        private const uint LR_LOADFROMFILE = 0x00000010;
        private const int WM_SETICON = 0x0080;
        private const int ICON_SMALL = 0;
        private const int ICON_BIG = 1;

        private const int WM_NCLBUTTONDOWN = 0xA1;
        private const int HTCAPTION = 0x2;

        private const string CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

        private static IntPtr _hBigIcon = IntPtr.Zero;
        private static IntPtr _hSmallIcon = IntPtr.Zero;

        [STAThread]
        public static void Main() {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            int port = 3001;

            // 1. Start backend Node.js server asynchronously (non-blocking)
            if (!IsPortOpen("127.0.0.1", port)) {
                try {
                    ProcessStartInfo psi = new ProcessStartInfo {
                        FileName = "node",
                        Arguments = "server/index.js",
                        WorkingDirectory = baseDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    serverProcess = Process.Start(psi);
                } catch {}
            }

            // 2. Create pure frameless desktop window immediately
            App app = new App();
            Window win = new Window {
                Title = "Aura IDE",
                WindowStyle = WindowStyle.None,
                ResizeMode = ResizeMode.CanResize,
                Width = 1420,
                Height = 880,
                MinWidth = 800,
                MinHeight = 520,
                WindowStartupLocation = WindowStartupLocation.CenterScreen,
                Background = new SolidColorBrush(Color.FromRgb(24, 24, 26))
            };

            // Custom borderless chrome
            var chrome = new System.Windows.Shell.WindowChrome {
                CaptionHeight = 0,
                ResizeBorderThickness = new Thickness(6),
                CornerRadius = new CornerRadius(0),
                GlassFrameThickness = new Thickness(0),
                UseAeroCaptionButtons = false
            };
            System.Windows.Shell.WindowChrome.SetWindowChrome(win, chrome);

            // Set high-res window decoder icon
            string icoPath = Path.Combine(baseDir, "aura.ico");
            if (File.Exists(icoPath)) {
                try {
                    var uri = new Uri(icoPath, UriKind.Absolute);
                    var decoder = BitmapDecoder.Create(uri, BitmapCreateOptions.None, BitmapCacheOption.OnLoad);
                    win.Icon = decoder.Frames[0];
                } catch {}
            }

            // 3. Main Host Grid with single high-performance WebView2
            Grid rootGrid = new Grid();
            WebView2 webView = new WebView2();
            rootGrid.Children.Add(webView);
            win.Content = rootGrid;

            bool isTrueFullscreen = false;
            RECT normalWindowRect = new RECT();
            WindowState preFullscreenState = WindowState.Normal;

            Action toggleFullscreen = () => {
                IntPtr hwnd = new WindowInteropHelper(win).Handle;
                if (!isTrueFullscreen) {
                    isTrueFullscreen = true;
                    GetWindowRect(hwnd, out normalWindowRect);
                    preFullscreenState = win.WindowState;

                    win.WindowState = WindowState.Normal;
                    win.ResizeMode = ResizeMode.NoResize;
                    rootGrid.Margin = new Thickness(0);

                    IntPtr hMonitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                    MONITORINFO mi = new MONITORINFO();
                    GetMonitorInfo(hMonitor, mi);

                    int monitorW = mi.rcMonitor.Right - mi.rcMonitor.Left;
                    int monitorH = mi.rcMonitor.Bottom - mi.rcMonitor.Top;

                    SetWindowPos(hwnd, HWND_TOPMOST, mi.rcMonitor.Left, mi.rcMonitor.Top, monitorW, monitorH, SWP_FRAMECHANGED | SWP_SHOWWINDOW);
                    win.Topmost = true;

                    try {
                        if (webView.CoreWebView2 != null) webView.CoreWebView2.PostWebMessageAsString("window-fullscreen-on");
                    } catch {}
                } else {
                    isTrueFullscreen = false;
                    win.Topmost = false;
                    win.ResizeMode = ResizeMode.CanResize;

                    if (preFullscreenState == WindowState.Maximized) {
                        win.WindowState = WindowState.Maximized;
                        rootGrid.Margin = new Thickness(6);
                    } else {
                        win.WindowState = WindowState.Normal;
                        rootGrid.Margin = new Thickness(0);
                        int w = normalWindowRect.Right - normalWindowRect.Left;
                        int h = normalWindowRect.Bottom - normalWindowRect.Top;
                        if (w > 200 && h > 200) {
                            SetWindowPos(hwnd, HWND_NOTOPMOST, normalWindowRect.Left, normalWindowRect.Top, w, h, SWP_FRAMECHANGED | SWP_SHOWWINDOW);
                        }
                    }

                    try {
                        if (webView.CoreWebView2 != null) webView.CoreWebView2.PostWebMessageAsString("window-fullscreen-off");
                    } catch {}
                }
            };

            win.StateChanged += (s, e) => {
                try {
                    if (isTrueFullscreen) return;
                    if (win.WindowState == WindowState.Maximized) {
                        rootGrid.Margin = new Thickness(6);
                    } else {
                        rootGrid.Margin = new Thickness(0);
                    }
                    string stateMsg = win.WindowState == WindowState.Maximized ? "window-maximized" : "window-restored";
                    if (webView.CoreWebView2 != null) webView.CoreWebView2.PostWebMessageAsString(stateMsg);
                } catch {}
            };

            win.SourceInitialized += (s, e) => {
                IntPtr hwnd = new WindowInteropHelper(win).Handle;

                if (File.Exists(icoPath)) {
                    try {
                        _hBigIcon = LoadImage(IntPtr.Zero, icoPath, IMAGE_ICON, 48, 48, LR_LOADFROMFILE);
                        if (_hBigIcon == IntPtr.Zero) _hBigIcon = LoadImage(IntPtr.Zero, icoPath, IMAGE_ICON, 256, 256, LR_LOADFROMFILE);
                        _hSmallIcon = LoadImage(IntPtr.Zero, icoPath, IMAGE_ICON, 32, 32, LR_LOADFROMFILE);
                        if (_hSmallIcon == IntPtr.Zero) _hSmallIcon = LoadImage(IntPtr.Zero, icoPath, IMAGE_ICON, 16, 16, LR_LOADFROMFILE);

                        if (_hBigIcon != IntPtr.Zero) SendMessage(hwnd, WM_SETICON, (IntPtr)ICON_BIG, _hBigIcon);
                        if (_hSmallIcon != IntPtr.Zero) SendMessage(hwnd, WM_SETICON, (IntPtr)ICON_SMALL, _hSmallIcon);
                    } catch {}
                }

                // Force DWM Immersive Dark Mode on window frame
                int darkMode = 1;
                DwmSetWindowAttribute(hwnd, 20, ref darkMode, sizeof(int));
                DwmSetWindowAttribute(hwnd, 19, ref darkMode, sizeof(int));
                int darkBorder = 0x001A1818;
                DwmSetWindowAttribute(hwnd, 34, ref darkBorder, sizeof(int));
            };

            win.Loaded += async (s, e) => {
                try {
                    // Poll server port in background task while WebView2 environment is created
                    var portTask = Task.Run(() => {
                        for (int i = 0; i < 60; i++) {
                            if (IsPortOpen("127.0.0.1", port)) return true;
                            Thread.Sleep(50);
                        }
                        return false;
                    });

                    string userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AuraIDE", "WebViewData");

                    // Standard stable Chromium options
                    var envOptions = new CoreWebView2EnvironmentOptions();
                    var sharedEnv = await CoreWebView2Environment.CreateAsync(null, userDataFolder, envOptions);

                    await portTask;
                    await webView.EnsureCoreWebView2Async(sharedEnv);
                    webView.DefaultBackgroundColor = System.Drawing.Color.FromArgb(24, 24, 26);
                    webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                    webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
                    webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                    webView.CoreWebView2.Settings.UserAgent = CHROME_UA;

                    webView.CoreWebView2.WebMessageReceived += (sender, args) => {
                        try {
                            string msg = args.TryGetWebMessageAsString();
                            if (string.IsNullOrEmpty(msg)) return;

                            if (msg == "window-close") {
                                win.Close();
                            } else if (msg == "window-minimize") {
                                win.WindowState = WindowState.Minimized;
                            } else if (msg == "window-maximize") {
                                if (win.WindowState == WindowState.Maximized) {
                                    win.WindowState = WindowState.Normal;
                                } else {
                                    win.WindowState = WindowState.Maximized;
                                }
                            } else if (msg == "window-fullscreen" || msg == "window-fullscreen-toggle") {
                                toggleFullscreen();
                            } else if (msg == "window-drag") {
                                win.Dispatcher.Invoke(() => {
                                    IntPtr hwnd = new WindowInteropHelper(win).Handle;
                                    ReleaseCapture();
                                    POINT pt;
                                    GetCursorPos(out pt);
                                    IntPtr lParam = (IntPtr)((pt.Y << 16) | (pt.X & 0xFFFF));
                                    SendMessage(hwnd, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, lParam);
                                });
                            } else if (msg == "dialog-open-folder") {
                                win.Dispatcher.Invoke(() => {
                                    try {
                                        using (var dialog = new System.Windows.Forms.FolderBrowserDialog()) {
                                            dialog.Description = "Выберите папку проекта (Aura IDE)";
                                            dialog.ShowNewFolderButton = true;
                                            var owner = new Wpf32Window(new WindowInteropHelper(win).Handle);
                                            var res = dialog.ShowDialog(owner);
                                            if (res == System.Windows.Forms.DialogResult.OK && !string.IsNullOrWhiteSpace(dialog.SelectedPath)) {
                                                webView.CoreWebView2.PostWebMessageAsString("folder-selected:" + dialog.SelectedPath);
                                            }
                                        }
                                    } catch {}
                                });
                            } else if (msg == "dialog-open-file") {
                                win.Dispatcher.Invoke(() => {
                                    try {
                                        using (var dialog = new System.Windows.Forms.OpenFileDialog()) {
                                            dialog.Title = "Выберите исполняемый файл (python.exe)";
                                            dialog.Filter = "Исполняемые файлы (*.exe)|*.exe|Все файлы (*.*)|*.*";
                                            var owner = new Wpf32Window(new WindowInteropHelper(win).Handle);
                                            var res = dialog.ShowDialog(owner);
                                            if (res == System.Windows.Forms.DialogResult.OK && !string.IsNullOrWhiteSpace(dialog.FileName)) {
                                                webView.CoreWebView2.PostWebMessageAsString("file-selected:" + dialog.FileName);
                                            }
                                        }
                                    } catch {}
                                });
                            }
                        } catch {}
                    };

                    webView.CoreWebView2.Navigate("http://localhost:3001");
                } catch (Exception ex) {
                    MessageBox.Show("Ошибка запуска WebView2: " + ex.Message, "Aura IDE Error", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            };

            win.Closed += (s, e) => {
                if (_hBigIcon != IntPtr.Zero) {
                    try { DestroyIcon(_hBigIcon); } catch {}
                    _hBigIcon = IntPtr.Zero;
                }
                if (_hSmallIcon != IntPtr.Zero) {
                    try { DestroyIcon(_hSmallIcon); } catch {}
                    _hSmallIcon = IntPtr.Zero;
                }

                if (serverProcess != null && !serverProcess.HasExited) {
                    try {
                        Process.Start(new ProcessStartInfo {
                            FileName = "taskkill",
                            Arguments = "/PID " + serverProcess.Id + " /T /F",
                            CreateNoWindow = true,
                            UseShellExecute = false
                        });
                    } catch {
                        try { serverProcess.Kill(); } catch {}
                    }
                }
            };

            app.Run(win);
        }

        private static bool IsPortOpen(string host, int port) {
            try {
                using (TcpClient client = new TcpClient()) {
                    var result = client.BeginConnect(host, port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(150);
                    if (!success) return false;
                    client.EndConnect(result);
                    return true;
                }
            } catch {
                return false;
            }
        }
    }
}
