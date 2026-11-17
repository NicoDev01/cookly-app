import Foundation

/// HTTP-Zugang zu `POST/GET /share/import` (convex/http.ts). Antwortformen: convex/lib/shareImport.ts.
struct ShareIngredient: Decodable, Hashable {
    let name: String
    let amount: String?
}

struct ShareStep: Decodable, Hashable {
    let text: String
}

struct ShareRecipe: Decodable {
    let recipeId: String
    let title: String
    let imageUrl: String?
    let category: String?
    let portions: Double?
    let prepTimeMinutes: Double?
    let ingredients: [ShareIngredient]
    let instructions: [ShareStep]
}

struct SharePoll: Decodable {
    let operationId: String
    let status: String
    let phase: String?
    let errorCode: String?
    let previewImageUrl: String?
    let recipe: ShareRecipe?
}

struct ShareStart: Decodable {
    let operationId: String
    let status: String
    let duplicate: Bool?
}

private struct ShareErrorBody: Decodable {
    let error: String
    let limit: Int?
}

enum ShareImportError: Error {
    case unauthorized
    case limitReached(limit: Int?)
    case rateLimited
    case invalidLink
    case unavailable
    case network
}

final class ShareImportClient {
    private let base: URL
    private let token: String
    private let session: URLSession

    init?(credentials: ShareCredentials) {
        guard let base = URL(string: credentials.apiBase), base.scheme == "https" else { return nil }
        self.base = base
        self.token = credentials.token
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 15
        config.waitsForConnectivity = false
        self.session = URLSession(configuration: config)
    }

    func start(operationId: String, url: String, text: String?, title: String?) async throws -> ShareStart {
        var request = URLRequest(url: base.appendingPathComponent("share/import"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: String] = ["operationId": operationId, "url": url]
        if let text, !text.isEmpty { body["text"] = String(text.prefix(5000)) }
        if let title, !title.isEmpty { body["title"] = String(title.prefix(500)) }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await send(request)
    }

    func poll(operationId: String) async throws -> SharePoll {
        var components = URLComponents(url: base.appendingPathComponent("share/import"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "operationId", value: operationId)]
        guard let url = components?.url else { throw ShareImportError.network }
        return try await send(URLRequest(url: url))
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        var request = request
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw ShareImportError.network
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 200 {
            do { return try JSONDecoder().decode(T.self, from: data) } catch { throw ShareImportError.unavailable }
        }
        let body = try? JSONDecoder().decode(ShareErrorBody.self, from: data)
        switch (status, body?.error) {
        case (401, _): throw ShareImportError.unauthorized
        case (402, _), (_, "LIMIT_REACHED"): throw ShareImportError.limitReached(limit: body?.limit)
        case (429, _): throw ShareImportError.rateLimited
        case (400, "INVALID_IMPORT_URL"): throw ShareImportError.invalidLink
        default: throw ShareImportError.unavailable
        }
    }
}
