import Foundation
import SwiftUI

/// Ablauf eines Imports aus der Extension: starten, Status pollen, Rezept gestaffelt einblenden.
/// Zeiten und Schritte wie in der App (utils/importProgress.ts, components/import/ImportingRecipe.tsx).
@MainActor
final class ShareImportModel: ObservableObject {
    enum Step: Int { case detect, scrape, extract, save }
    enum Outcome: Equatable {
        case loading
        case saved(duplicate: Bool)
        /// Länger als die Poll-Zeit: Der Server speichert trotzdem, das Overlay darf zu.
        case stillRunning
        case noRecipe
        case limitReached(limit: Int?)
        case failed(message: String)
    }

    @Published private(set) var step: Step = .detect
    @Published private(set) var progress: Double = 0
    @Published private(set) var previewImageUrl: URL?
    @Published private(set) var recipe: ShareRecipe?
    @Published private(set) var shownIngredients = 0
    @Published private(set) var shownSteps = 0
    @Published private(set) var outcome: Outcome = .loading
    @Published private(set) var slow = false

    let isWebsite: Bool
    private let client: ShareImportClient
    private let url: String
    private let text: String?
    private let title: String?
    private var task: Task<Void, Never>?
    /// Bleibt bei einem Netzfehler vor der Server-Antwort gleich, damit „Erneut versuchen“ keinen zweiten Import startet.
    private var operationId = UUID().uuidString.lowercased()
    /// Token ungültig: Die Extension fällt auf den alten Weg (App öffnen) zurück.
    var onUnauthorized: (() -> Void)?

    private static let pollIntervalNs: UInt64 = 1_000_000_000
    /// Nur Zeit im Vordergrund zählt: Ein Abschnitt zählt höchstens `maxTickSeconds`, auch wenn iOS die Extension
    /// zwischendurch angehalten hat (App gewechselt, gesperrt).
    private static let maxPollSeconds = 60.0
    private static let maxTickSeconds = 3.0
    private static let pillDelayNs: UInt64 = 45_000_000
    private static let stepDelayNs: UInt64 = 90_000_000

    init(client: ShareImportClient, url: String, text: String?, title: String?) {
        self.client = client
        self.url = url
        self.text = text
        self.title = title
        let host = URL(string: url)?.host?.lowercased() ?? ""
        isWebsite = !["instagram.com", "tiktok.com", "facebook.com", "fb.watch"].contains { host.hasSuffix($0) }
    }

    var stepTitle: String {
        switch step {
        case .detect: return "Link erkannt"
        case .scrape: return isWebsite ? "Webseite wird gelesen" : "Beitrag wird geladen"
        case .extract: return "Rezept wird erkannt"
        case .save: return "Wird gespeichert"
        }
    }

    func start() {
        guard task == nil else { return }
        task = Task { await run() }
    }

    func retry() {
        task?.cancel()
        task = nil
        // Lief der Import auf dem Server schon (und ist gescheitert), braucht der neue Versuch eine neue ID.
        if serverKnowsOperation { operationId = UUID().uuidString.lowercased() }
        serverKnowsOperation = false
        step = .detect
        progress = 0
        outcome = .loading
        slow = false
        start()
    }

    func cancel() {
        task?.cancel()
    }

    private func setStep(_ next: Step) {
        guard next.rawValue >= step.rawValue else { return }
        step = next
        // Balken-Ziele wie IMPORT_STEP_TARGET in der App: vorne schnell, der Rest wartet ehrlich auf die KI.
        let (target, seconds): (Double, Double) = {
            switch next {
            case .detect: return (0.15, 0.4)
            case .scrape: return (0.82, isWebsite ? 2.0 : 3.0)
            case .extract: return (0.97, 3.0)
            case .save: return (1.0, 0.6)
            }
        }()
        withAnimation(.easeOut(duration: seconds)) { progress = target }
    }

    private var serverKnowsOperation = false

    private func run() async {
        setStep(.detect)
        let operationId = self.operationId
        let pollId: String
        do {
            let started = try await client.start(operationId: operationId, url: url, text: text, title: title)
            pollId = started.operationId
            serverKnowsOperation = true
        } catch {
            handle(error)
            return
        }

        var activeSeconds = 0.0
        var lastTick = Date()
        while !Task.isCancelled {
            do {
                let poll = try await client.poll(operationId: pollId)
                if let preview = poll.previewImageUrl, previewImageUrl == nil { previewImageUrl = URL(string: preview) }
                switch poll.status {
                case "succeeded":
                    if let recipe = poll.recipe {
                        await reveal(recipe, duplicate: pollId != operationId)
                    } else {
                        // Rezept inzwischen gelöscht (oder nicht mehr lesbar): nicht bis zum Zeitlimit weiterpollen.
                        outcome = .failed(message: "Das Rezept ist nicht mehr in deinem Kochbuch. Teile den Beitrag noch einmal, um es neu zu importieren.")
                    }
                    return
                case "failed", "released":
                    // Fehlercodes aus convex/lib/importErrors.ts; der Button darunter heißt „Erneut versuchen“.
                    switch poll.errorCode {
                    case "NO_RECIPE_CONTENT":
                        outcome = .noRecipe
                    case "API_UNAVAILABLE":
                        outcome = .failed(message: "Die KI ist gerade ausgelastet. Bitte versuch es gleich noch einmal.")
                    default:
                        outcome = .failed(message: "Das Rezept konnte nicht geladen werden. Bitte versuch es noch einmal.")
                    }
                    return
                case "running":
                    setStep(poll.phase == "extracting" ? .extract : .scrape)
                default:
                    break
                }
            } catch ShareImportError.unauthorized {
                // Token während des Imports ersetzt (z. B. Cookly geöffnet) oder widerrufen.
                // Der Import läuft auf dem Server weiter; die App nicht noch einmal öffnen.
                outcome = .stillRunning
                return
            } catch {
                // Einzelner Netzfehler beim Pollen (auch direkt nach der Rückkehr aus dem Hintergrund): weiter versuchen.
            }
            let now = Date()
            activeSeconds += min(now.timeIntervalSince(lastTick), Self.maxTickSeconds)
            lastTick = now
            if activeSeconds > 6 { slow = true }
            if activeSeconds > Self.maxPollSeconds {
                outcome = .stillRunning
                return
            }
            try? await Task.sleep(nanoseconds: Self.pollIntervalNs)
        }
    }

    private func reveal(_ recipe: ShareRecipe, duplicate: Bool) async {
        setStep(.save)
        self.recipe = recipe
        for index in recipe.ingredients.indices {
            try? await Task.sleep(nanoseconds: Self.pillDelayNs)
            withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) { shownIngredients = index + 1 }
        }
        try? await Task.sleep(nanoseconds: 100_000_000)
        for index in recipe.instructions.indices {
            try? await Task.sleep(nanoseconds: Self.stepDelayNs)
            withAnimation(.easeOut(duration: 0.35)) { shownSteps = index + 1 }
        }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { outcome = .saved(duplicate: duplicate) }
    }

    private func handle(_ error: Error) {
        switch error {
        case ShareImportError.unauthorized:
            onUnauthorized?()
        case ShareImportError.limitReached(let limit):
            outcome = .limitReached(limit: limit)
        case ShareImportError.rateLimited:
            outcome = .failed(message: "Gerade kommen zu viele Imports auf einmal. Bitte versuch es in ein paar Minuten noch einmal.")
        case ShareImportError.invalidLink:
            outcome = .failed(message: "Diesen Link kann Cookly nicht lesen. Teile einen Beitrag von Instagram, TikTok, Facebook oder eine Rezept-Webseite.")
        case ShareImportError.network:
            outcome = .failed(message: "Keine Verbindung. Prüfe dein Internet und versuch es noch einmal.")
        default:
            outcome = .failed(message: "Die KI ist gerade ausgelastet. Bitte versuch es gleich noch einmal.")
        }
    }
}
