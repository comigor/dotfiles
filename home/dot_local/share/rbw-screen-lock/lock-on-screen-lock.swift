import Foundation

let center = DistributedNotificationCenter.default()

for name in ["com.apple.screenIsLocked", "com.apple.screensaver.didstart"] {
    center.addObserver(forName: Notification.Name(name), object: nil, queue: nil) { _ in
        for client in ["bw", "rbw"] {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/\(client)")
            process.arguments = ["lock"]
            do {
                try process.run()
                process.waitUntilExit()
                if process.terminationStatus != 0 {
                    FileHandle.standardError.write(Data("\(client) lock failed: \(process.terminationStatus)\n".utf8))
                }
            } catch {
                FileHandle.standardError.write(Data("\(client) lock failed: \(error)\n".utf8))
            }
        }
    }
}

print("rbw-screen-lock: watching for screen lock events")
RunLoop.main.run()
