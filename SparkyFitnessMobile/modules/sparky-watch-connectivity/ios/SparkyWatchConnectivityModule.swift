import ExpoModulesCore

/// Expo Modules API wrapper around `WatchSessionManager`. Kept thin — all
/// `WCSession` handling lives in `WatchSessionManager` so it can be unit
/// tested / reasoned about without ExpoModulesCore in the picture.
public class SparkyWatchConnectivityModule: Module {
    public func definition() -> ModuleDefinition {
        Name("SparkyWatchConnectivity")

        Events("onCommand", "onReachabilityChange")

        OnCreate {
            WatchSessionManager.shared.onCommand = { [weak self] json in
                self?.sendEvent("onCommand", ["payload": json])
            }
            WatchSessionManager.shared.onReachabilityChange = { [weak self] reachable, paired, installed in
                self?.sendEvent("onReachabilityChange", [
                    "reachable": reachable,
                    "paired": paired,
                    "watchAppInstalled": installed,
                ])
            }
        }

        Function("isSupported") { () -> Bool in
            WatchSessionManager.shared.isSupported
        }

        Function("activate") { () -> Void in
            WatchSessionManager.shared.activate()
        }

        AsyncFunction("updateContext") { (json: String) -> Void in
            try WatchSessionManager.shared.updateContext(json: json)
        }

        Function("getReachability") { () -> [String: Bool] in
            WatchSessionManager.shared.reachabilityInfo()
        }
    }
}
