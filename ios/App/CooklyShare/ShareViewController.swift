import UIKit
import SwiftUI
import Social
import UniformTypeIdentifiers

/// Teilen-Ziel von Cookly.
/// Mit Import-Zugang (ShareCredentials, von der App nach dem Login gesetzt) läuft der Import direkt hier im Overlay.
/// Ohne Zugang, ohne Link oder bei abgelehntem Zugang öffnet die Extension wie bisher die App (`cookly://share-target`).
class ShareViewController: UIViewController {

    private let urlScheme = "cookly://share-target"

    private struct SharedContent {
        let url: String?
        let text: String?
        let title: String?
    }

    private var content: SharedContent?
    private var style: ShareOverlayView.Style?
    private var model: ShareImportModel?
    private var mounted = false
    private var finished = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        Task {
            let shared = await readSharedContent()
            start(with: shared)
        }
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        // Vollbild (NSExtensionActionWantsFullScreenPresentation): eigene 70-%-Karte. Sonst zeigt iOS ein Sheet.
        let screenHeight = view.window?.windowScene?.screen.bounds.height ?? view.bounds.height
        style = view.bounds.height >= screenHeight - 1 ? .card : .sheet
        if style == .card { clearSystemBackgrounds() }
        mountIfReady()
    }

    // MARK: - Ablauf

    private func start(with shared: SharedContent) {
        content = shared
        guard
            let url = shared.url,
            let stored = ShareCredentials.load(),
            !stored.isExpired,
            let client = ShareImportClient(credentials: stored)
        else {
            openAppWithLegacyLink()
            return
        }
        let model = ShareImportModel(client: client, url: url, text: shared.text, title: shared.title)
        model.onUnauthorized = { [weak self] in
            // Nur den eigenen, abgelehnten Token löschen; hat die App inzwischen einen neuen gesetzt, bleibt der.
            if ShareCredentials.load()?.token == stored.token { ShareCredentials.clear() }
            self?.openAppWithLegacyLink()
        }
        self.model = model
        model.start()
        mountIfReady()
    }

    private func mountIfReady() {
        guard !mounted, !finished, let model, let style else { return }
        mounted = true
        let overlay = ShareOverlayView(model: model, style: style) { [weak self] url in
            self?.finish(opening: url)
        }
        let host = UIHostingController(rootView: overlay)
        host.view.backgroundColor = .clear
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        host.didMove(toParent: self)
    }

    private func finish(opening url: URL?) {
        guard !finished else { return }
        finished = true
        model?.cancel()
        if let url { openMainApp(url: url) }
        completeExtension()
    }

    /// Bisheriger Weg: App mit dem geteilten Inhalt öffnen, dort läuft der Import (ShareTargetPage).
    private func openAppWithLegacyLink() {
        guard !finished else { return }
        finished = true
        model?.cancel()
        var components = URLComponents(string: urlScheme)
        var queryItems: [URLQueryItem] = []
        if let url = content?.url, !url.isEmpty { queryItems.append(URLQueryItem(name: "url", value: url)) }
        if let text = content?.text, !text.isEmpty { queryItems.append(URLQueryItem(name: "text", value: text)) }
        if let title = content?.title, !title.isEmpty { queryItems.append(URLQueryItem(name: "title", value: title)) }
        components?.queryItems = queryItems
        if let launchUrl = components?.url {
            openMainApp(url: launchUrl)
        }
        completeExtension()
    }

    /// iOS 26 lässt Hintergründe der Extension-Container teils weiß (FB20934974); im Vollbild transparent machen.
    private func clearSystemBackgrounds() {
        var current: UIView? = view.superview
        while let container = current {
            container.backgroundColor = .clear
            current = container.superview
        }
    }

    // MARK: - Geteilten Inhalt lesen (unverändert zum bisherigen Stand)

    private func readSharedContent() async -> SharedContent {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem], !items.isEmpty else {
            return SharedContent(url: nil, text: nil, title: nil)
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

        return SharedContent(
            url: foundUrl.flatMap { $0.isEmpty ? nil : $0 },
            text: foundText.flatMap { $0.isEmpty ? nil : $0 },
            title: foundTitle.flatMap { $0.isEmpty ? nil : $0 }
        )
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
