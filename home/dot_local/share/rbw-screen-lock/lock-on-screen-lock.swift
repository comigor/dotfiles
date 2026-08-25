import Foundation

let center = DistributedNotificationCenter.default()

for name in ["com.apple.screenIsLocked", "com.apple.screensaver.didstart"] {
    center.addObserver(forName: Notification.Name(name), object: nil, queue: nil) { _ in
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/rbw")
        process.arguments = ["lock"]
        try? process.run()
        process.waitUntilExit()
    }
}

print("rbw-screen-lock: watching for screen lock events")
RunLoop.main.run()
