import Foundation
import Security

/// Zugang der Share-Extension zum Import (`POST/GET /share/import`, convex/http.ts).
/// Die App schreibt ihn nach dem Login (ShareAuthPlugin), die Extension liest ihn (CooklyShare).
/// Liegt im Keychain der gemeinsamen App-Gruppe, nur auf diesem Gerät und erst nach dem ersten Entsperren lesbar.
/// Die App-Gruppe dient als Keychain-Zugriffsgruppe, damit die Standardgruppe der App unverändert bleibt.
struct ShareCredentials: Codable {
    let token: String
    /// Convex-HTTP-Adresse der App, z. B. https://<deployment>.convex.site
    let apiBase: String
    let userId: String
    /// Millisekunden seit 1970, wie in JavaScript.
    let issuedAt: Double
    let expiresAt: Double

    static let accessGroup = "group.com.cookly-app.recipe"
    private static let service = "com.cookly.recipe.share-import"
    private static let account = "default"
    /// Merker im Container der App-Gruppe. Den löscht iOS beim Deinstallieren, den Keychain-Eintrag nicht:
    /// Fehlt der Merker, stammt der Token aus einer früheren Installation und wird ignoriert.
    private static let markerKey = "shareImport.issuedAt"
    private static var groupDefaults: UserDefaults? { UserDefaults(suiteName: accessGroup) }

    var isExpired: Bool { expiresAt <= Date().timeIntervalSince1970 * 1000 }

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup,
        ]
    }

    static func load() -> ShareCredentials? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        guard let credentials = try? JSONDecoder().decode(ShareCredentials.self, from: data) else { return nil }
        guard groupDefaults?.double(forKey: markerKey) == credentials.issuedAt else { return nil }
        return credentials
    }

    @discardableResult
    static func save(_ credentials: ShareCredentials) -> OSStatus {
        guard let data = try? JSONEncoder().encode(credentials) else { return errSecParam }
        SecItemDelete(baseQuery as CFDictionary)
        var attributes = baseQuery
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        if status == errSecSuccess { groupDefaults?.set(credentials.issuedAt, forKey: markerKey) }
        return status
    }

    @discardableResult
    static func clear() -> OSStatus {
        groupDefaults?.removeObject(forKey: markerKey)
        return SecItemDelete(baseQuery as CFDictionary)
    }
}
