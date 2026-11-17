import Capacitor
import Foundation
import Security

/// Gibt der Share-Extension den Import-Zugang (services/shareAuth.ts → ShareCredentials im Keychain).
/// Registriert in CooklyBridgeViewController.
@objc(ShareAuthPlugin)
public class ShareAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareAuthPlugin"
    public let jsName = "ShareAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearToken", returnType: CAPPluginReturnPromise),
    ]

    private static let installationKey = "cookly.shareImport.installationId"

    /// Pro Installation stabil; neu nach Neuinstallation (UserDefaults werden mit der App gelöscht).
    private var installationId: String {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: Self.installationKey) { return existing }
        let created = UUID().uuidString
        defaults.set(created, forKey: Self.installationKey)
        return created
    }

    @objc func getState(_ call: CAPPluginCall) {
        var result: [String: Any] = ["installationId": installationId, "hasToken": false]
        if let credentials = ShareCredentials.load() {
            result["hasToken"] = !credentials.isExpired
            result["userId"] = credentials.userId
            result["apiBase"] = credentials.apiBase
            result["issuedAt"] = credentials.issuedAt
        }
        call.resolve(result)
    }

    @objc func setToken(_ call: CAPPluginCall) {
        guard
            let token = call.getString("token"), token.hasPrefix("cks_"),
            let apiBase = call.getString("apiBase"), apiBase.hasPrefix("https://"),
            let userId = call.getString("userId"), !userId.isEmpty,
            let issuedAt = call.getDouble("issuedAt"),
            let expiresAt = call.getDouble("expiresAt")
        else {
            call.reject("INVALID_ARGUMENTS")
            return
        }
        let status = ShareCredentials.save(ShareCredentials(token: token, apiBase: apiBase, userId: userId, issuedAt: issuedAt, expiresAt: expiresAt))
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("KEYCHAIN_\(status)")
        }
    }

    @objc func clearToken(_ call: CAPPluginCall) {
        ShareCredentials.clear()
        call.resolve()
    }
}
