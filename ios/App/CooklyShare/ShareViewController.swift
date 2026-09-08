import UIKit
import Social
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

    private let appGroupId = "group.com.cookly-app.recipe"
    private let urlScheme = "cookly://share-target"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        Task {
            await handleSharedContent()
        }
    }

    private func handleSharedContent() async {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem], !items.isEmpty else {
            completeExtension()
            return
        }

        var foundUrl: String?
        var foundText: String?
        var foundTitle: String?

        for item in items {
            if let title = item.attributedTitle?.string {
                foundTitle = title
            }
            guard let attachments = item.attachments else { continue }

            for provider in attachments {
                // 1. URL direkt prüfen
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    do {
                        if let itemUrl = try await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                            foundUrl = itemUrl.absoluteString
                            break
                        }
                    } catch {
                        NSLog("[CooklyShare] Error loading URL: %@", error.localizedDescription)
                    }
                }

                // 2. Text prüfen (Instagram, TikTok etc. teilen URLs oft als Text)
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    do {
                        if let text = try await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                            foundText = text
                            // Falls Text eine URL enthält und wir noch keine foundUrl haben, extrahieren
                            if foundUrl == nil, let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) {
                                let matches = detector.matches(in: text, options: [], range: NSRange(location: 0, length: text.utf16.count))
                                if let firstMatch = matches.first, let range = Range(firstMatch.range, in: text) {
                                    foundUrl = String(text[range])
                                }
                            }
                        }
                    } catch {
                        NSLog("[CooklyShare] Error loading text: %@", error.localizedDescription)
                    }
                }
            }
            if foundUrl != nil { break }
        }

        let targetUrlString = foundUrl ?? ""
        let targetTextString = foundText ?? ""
        let targetTitleString = foundTitle ?? ""

        // Im App Group Container speichern für Zuverlässigkeit
        if let sharedDefaults = UserDefaults(suiteName: appGroupId) {
            sharedDefaults.set([
                "url": targetUrlString,
                "text": targetTextString,
                "title": targetTitleString,
                "timestamp": Date().timeIntervalSince1970
            ], forKey: "latestShare")
            sharedDefaults.synchronize()
        }

        // Deep Link zusammenbauen
        var components = URLComponents(string: urlScheme)
        var queryItems: [URLQueryItem] = []
        if !targetUrlString.isEmpty {
            queryItems.append(URLQueryItem(name: "url", value: targetUrlString))
        }
        if !targetTextString.isEmpty {
            queryItems.append(URLQueryItem(name: "text", value: targetTextString))
        }
        if !targetTitleString.isEmpty {
            queryItems.append(URLQueryItem(name: "title", value: targetTitleString))
        }
        components?.queryItems = queryItems

        if let launchUrl = components?.url {
            DispatchQueue.main.async {
                self.openMainApp(url: launchUrl)
                self.completeExtension()
            }
        } else {
            DispatchQueue.main.async {
                self.completeExtension()
            }
        }
    }

    private func openMainApp(url: URL) {
        var responder: UIResponder? = self
        while responder != nil {
            if let application = responder as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return
            }
            responder = responder?.next
        }
    }

    private func completeExtension() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}
