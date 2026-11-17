import SwiftUI
import UIKit

/// Import-Overlay über der teilenden App. Vorlage: Lab `#/lab/overlay/a` (lab/overlay/OverlayDemo.tsx).
/// `card`: eigene Karte mit ~70 % Höhe, die teilende App bleibt oben sichtbar (Vollbild-Präsentation der Extension).
/// `sheet`: Rückfall, wenn iOS die Extension doch als System-Sheet zeigt; dann füllt der Inhalt das Sheet.
struct ShareOverlayView: View {
    enum Style { case card, sheet }

    @ObservedObject var model: ShareImportModel
    let style: Style
    /// Schließen; `then` läuft nach der Ausblend-Animation (z. B. App öffnen).
    let onFinish: (_ openURL: URL?) -> Void

    @State var appeared = false
    @State var dragOffset: CGFloat = 0

    var body: some View {
        switch style {
        case .sheet:
            content.background(Palette.card.ignoresSafeArea())
        case .card:
            GeometryReader { geo in
                ZStack(alignment: .bottom) {
                    Color.black.opacity(appeared ? 0.25 : 0)
                        .ignoresSafeArea()
                        .onTapGesture { close() }
                    VStack(spacing: 0) {
                        grabber
                        content
                    }
                    .frame(height: geo.size.height * 0.7 + geo.safeAreaInsets.bottom)
                    .background(Palette.card)
                    .clipShape(TopRoundedShape(radius: 28))
                    .shadow(color: .black.opacity(0.22), radius: 20, y: -6)
                    .offset(y: appeared ? dragOffset : geo.size.height)
                }
                .ignoresSafeArea(edges: .bottom)
            }
            .onAppear {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.9)) { appeared = true }
            }
        }
    }

    private var grabber: some View {
        Capsule()
            .fill(Color(white: 0.82))
            .frame(width: 40, height: 5)
            .padding(.top, 10)
            .padding(.bottom, 12)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture()
                    .onChanged { value in
                        let dy = value.translation.height
                        dragOffset = dy > 0 ? dy : dy / 6
                    }
                    .onEnded { value in
                        let fling = value.predictedEndTranslation.height - value.translation.height
                        if value.translation.height > 110 || fling > 200 {
                            close()
                        } else {
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { dragOffset = 0 }
                        }
                    }
            )
    }

    @ViewBuilder private var content: some View {
        switch model.outcome {
        case .noRecipe:
            ProblemView(
                icon: "exclamationmark.circle", tint: .gray,
                title: "Hier war kein Rezept drin",
                message: "In diesem Beitrag steht das Rezept weder im Text noch wird es gesprochen. In Cookly kannst du es per Foto oder von Hand speichern.",
                primary: ("In Cookly öffnen", Palette.green, { close(open: DeepLink.home) }),
                onClose: { close() })
        case .limitReached(let limit):
            ProblemView(
                icon: "lock", tint: .orange,
                title: "Gratis-Imports aufgebraucht",
                message: "Du hast alle \(limit ?? 60) Link-Imports genutzt. Mit Cookly Pro importierst du unbegrenzt.",
                primary: ("Cookly Pro ansehen", Palette.ink, { close(open: DeepLink.subscribe) }),
                onClose: { close() })
        case .failed(let message):
            ProblemView(
                icon: "wifi.exclamationmark", tint: .gray,
                title: "Das hat nicht geklappt",
                message: message,
                primary: ("Erneut versuchen", Palette.green, { model.retry() }),
                onClose: { close() })
        default:
            importContent
        }
    }

    private var importContent: some View {
        VStack(spacing: 0) {
            header
            ScrollView(showsIndicators: false) {
                RecipeLiveView(model: model)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 16)
            }
            footer
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                switch model.outcome {
                case .saved(let duplicate):
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .heavy))
                            .foregroundColor(.white)
                            .frame(width: 24, height: 24)
                            .background(Circle().fill(Palette.green))
                        Text(duplicate ? "Schon in deinem Kochbuch" : "Gespeichert in \(model.recipe?.category ?? "deinem Kochbuch")")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(Palette.green)
                    }
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
                case .stillRunning:
                    Text("Dauert länger als sonst")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(Palette.ink)
                default:
                    Text("\(model.stepTitle) …")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(Palette.ink)
                        .id(model.step)
                        .transition(.opacity)
                    ProgressBar(value: model.progress)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            CloseButton { close() }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
        .padding(.top, style == .sheet ? 20 : 0)
    }

    private var footer: some View {
        VStack(spacing: 0) {
            Divider().opacity(0.4)
            HStack(spacing: 10) {
                switch model.outcome {
                case .saved:
                    Button {
                        close(open: model.recipe.flatMap { DeepLink.edit(recipeId: $0.recipeId) })
                    } label: {
                        Label("Bearbeiten", systemImage: "pencil")
                            .font(.system(size: 15.5, weight: .semibold))
                            .foregroundColor(Palette.ink)
                            .frame(maxWidth: .infinity, minHeight: 50)
                            .background(RoundedRectangle(cornerRadius: 16).fill(Palette.muted))
                    }
                    Button { close() } label: {
                        Text("Fertig")
                            .font(.system(size: 15.5, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, minHeight: 50)
                            .background(RoundedRectangle(cornerRadius: 16).fill(Palette.green))
                    }
                case .stillRunning:
                    Button { close() } label: {
                        Text("Schließen, Cookly speichert es trotzdem")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, minHeight: 50)
                            .background(RoundedRectangle(cornerRadius: 16).fill(Palette.green))
                    }
                default:
                    Text(model.slow ? "Dauert etwas länger. Schließ ruhig, Cookly speichert trotzdem." : "Wird automatisch gespeichert. Schließen geht jederzeit.")
                        .font(.system(size: 13))
                        .foregroundColor(Palette.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 14)
        }
    }

    private func close(open url: URL? = nil) {
        model.cancel()
        guard style == .card else {
            onFinish(url)
            return
        }
        withAnimation(.easeIn(duration: 0.25)) {
            appeared = false
            dragOffset = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.27) { onFinish(url) }
    }
}

/// Bild, Titel, Zutaten-Pillen und Zubereitung wie in ImportingRecipe; Platzhalter pulsieren, bis Daten da sind.
private struct RecipeLiveView: View {
    @ObservedObject var model: ShareImportModel

    var body: some View {
        let recipe = model.recipe
        VStack(alignment: .leading, spacing: 0) {
            HeroImage(url: (recipe?.imageUrl).flatMap { URL(string: $0) } ?? model.previewImageUrl)

            if let recipe {
                VStack(alignment: .leading, spacing: 6) {
                    Text(recipe.title.uppercased())
                        .font(.system(size: 26, weight: .black))
                        .foregroundColor(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 12) {
                        if let portions = recipe.portions, portions > 0 { Text("\(Int(portions)) Portionen") }
                        if let minutes = recipe.prepTimeMinutes, minutes > 0 { Text("\(Int(minutes)) Min.") }
                    }
                    .font(.system(size: 12))
                    .foregroundColor(Palette.secondary)
                }
                .padding(.top, 16)
                .transition(.opacity.combined(with: .offset(y: 8)))
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Bone(width: 210, height: 30, radius: 10)
                    Bone(width: 112, height: 18, radius: 9)
                }
                .padding(.top, 16)
            }

            SectionTitle("Zutaten").padding(.top, 22)
            PillFlow {
                if let recipe {
                    ForEach(Array(recipe.ingredients.prefix(model.shownIngredients).enumerated()), id: \.offset) { index, ingredient in
                        IngredientPill(ingredient: ingredient, color: Palette.pill(index))
                            .transition(.scale(scale: 0.82).combined(with: .opacity))
                    }
                    ForEach(0..<max(0, recipe.ingredients.count - model.shownIngredients), id: \.self) { index in
                        Bone(width: Palette.boneWidths[(index + model.shownIngredients) % Palette.boneWidths.count], height: 30, radius: 15)
                    }
                } else {
                    ForEach(0..<8, id: \.self) { index in
                        Bone(width: Palette.boneWidths[index], height: 30, radius: 15)
                    }
                }
            }

            SectionTitle("Zubereitung").padding(.top, 26)
            VStack(alignment: .leading, spacing: 16) {
                if let recipe {
                    ForEach(Array(recipe.instructions.prefix(model.shownSteps).enumerated()), id: \.offset) { index, step in
                        StepRow(number: index + 1, text: step.text)
                            .transition(.opacity.combined(with: .offset(y: 8)))
                    }
                }
                ForEach(0..<max(0, (recipe?.instructions.count ?? 3) - model.shownSteps), id: \.self) { index in
                    HStack(alignment: .top, spacing: 12) {
                        Bone(width: 22, height: 22, radius: 11)
                        VStack(alignment: .leading, spacing: 9) {
                            Bone(height: 13)
                            Bone(width: index % 2 == 0 ? 220 : 140, height: 13)
                        }
                        .padding(.top, 4)
                    }
                }
            }
        }
    }
}

private struct HeroImage: View {
    let url: URL?

    var body: some View {
        ZStack {
            Bone(radius: 0)
            if let url {
                AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.6))) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill().transition(.opacity)
                    }
                }
            }
        }
        .aspectRatio(2, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct IngredientPill: View {
    let ingredient: ShareIngredient
    let color: Color

    var body: some View {
        Text((ingredient.amount.map { "\($0) " } ?? "") + ingredient.name)
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(.black)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(Capsule().fill(color))
            .shadow(color: Color(red: 0.83, green: 0.84, blue: 0.84), radius: 2, x: 2, y: 2)
    }
}

private struct StepRow: View {
    let number: Int
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 22, height: 22)
                .background(Circle().fill(Palette.green))
            Text(text)
                .font(.system(size: 15))
                .foregroundColor(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct SectionTitle: View {
    let title: String
    init(_ title: String) { self.title = title }

    var body: some View {
        Text(title)
            .font(.system(size: 18, weight: .bold))
            .foregroundColor(Palette.ink)
            .padding(.bottom, 12)
    }
}

/// Pulsierender Platzhalter (wie .imp-bone in components/import/importStyles.ts).
private struct Bone: View {
    var width: CGFloat?
    var height: CGFloat?
    var radius: CGFloat = 8
    @State var dim = false

    var body: some View {
        RoundedRectangle(cornerRadius: radius)
            .fill(Palette.bone)
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil, maxHeight: height == nil ? .infinity : nil)
            .opacity(dim ? 0.55 : 1)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { dim = true }
            }
    }
}

private struct ProgressBar: View {
    let value: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.muted)
                Capsule().fill(Palette.green).frame(width: max(6, geo.size.width * value))
            }
        }
        .frame(height: 6)
    }
}

private struct CloseButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(Palette.secondary)
                .frame(width: 32, height: 32)
                .background(Circle().fill(Palette.muted))
        }
        .accessibilityLabel("Schließen")
    }
}

private struct ProblemView: View {
    let icon: String
    let tint: Color
    let title: String
    let message: String
    let primary: (String, Color, () -> Void)
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                CloseButton(action: onClose)
            }
            .padding(.horizontal, 20)
            Spacer(minLength: 12)
            Image(systemName: icon)
                .font(.system(size: 26, weight: .semibold))
                .foregroundColor(tint)
                .frame(width: 56, height: 56)
                .background(Circle().fill(tint.opacity(0.12)))
            Text(title)
                .font(.system(size: 20, weight: .black))
                .foregroundColor(Palette.ink)
                .padding(.top, 16)
            Text(message)
                .font(.system(size: 14.5))
                .foregroundColor(Palette.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 300)
                .padding(.top, 8)
            Spacer(minLength: 12)
            Button(action: primary.2) {
                Text(primary.0)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(RoundedRectangle(cornerRadius: 16).fill(primary.1))
            }
            Button(action: onClose) {
                Text("Schließen")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Palette.secondary)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .padding(.bottom, 14)
        }
        .padding(.horizontal, 20)
        .transition(.opacity)
    }
}

/// Pillen in Zeilen umbrechen: ab iOS 16 per `Layout`, auf iOS 15 schlicht untereinander.
private struct PillFlow<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        if #available(iOS 16.0, *) {
            FlowLayout(spacing: 8) { content }
        } else {
            VStack(alignment: .leading, spacing: 8) { content }
        }
    }
}

@available(iOS 16.0, *)
private struct FlowLayout: Layout {
    let spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(subviews, width: proposal.width ?? .infinity)
        return CGSize(width: proposal.width ?? rows.maxWidth, height: rows.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = arrange(subviews, width: bounds.width)
        for (index, point) in rows.points.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y),
                proposal: ProposedViewSize(width: bounds.width, height: nil)
            )
        }
    }

    private func arrange(_ subviews: Subviews, width: CGFloat) -> (points: [CGPoint], height: CGFloat, maxWidth: CGFloat) {
        var points: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxWidth: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            points.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            maxWidth = max(maxWidth, x - spacing)
        }
        return (points, y + rowHeight, maxWidth)
    }
}

private struct TopRoundedShape: Shape {
    let radius: CGFloat

    func path(in rect: CGRect) -> Path {
        Path(UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: [.topLeft, .topRight],
            cornerRadii: CGSize(width: radius, height: radius)
        ).cgPath)
    }
}

enum Palette {
    static let green = Color(red: 0x2f / 255, green: 0x5d / 255, blue: 0x46 / 255)
    static let ink = Color(red: 0x11 / 255, green: 0x17 / 255, blue: 0x18 / 255)
    static let secondary = Color(white: 0.45)
    static let muted = Color(red: 0.95, green: 0.95, blue: 0.96)
    static let bone = Color(red: 0xe5 / 255, green: 0xe9 / 255, blue: 0xe7 / 255)
    static let card = Color.white
    static let boneWidths: [CGFloat] = [72, 132, 96, 84, 124, 108, 150, 90]

    /// Zutatenfarben wie ingredient-1-bg … ingredient-10-bg (tailwind.config.js), 20 % Deckkraft.
    private static let pills: [(Double, Double, Double)] = [
        (245, 158, 11), (132, 204, 22), (239, 68, 68), (168, 85, 247), (59, 130, 246),
        (20, 184, 166), (236, 72, 153), (99, 102, 241), (234, 179, 8), (16, 185, 129),
    ]

    static func pill(_ index: Int) -> Color {
        let (r, g, b) = pills[index % pills.count]
        return Color(red: r / 255, green: g / 255, blue: b / 255).opacity(0.2)
    }
}

enum DeepLink {
    static let home = URL(string: "cookly://tabs/categories")
    static let subscribe = URL(string: "cookly://subscribe")

    static func edit(recipeId: String) -> URL? {
        var components = URLComponents()
        components.scheme = "cookly"
        components.host = "recipe"
        components.path = "/\(recipeId)"
        components.queryItems = [URLQueryItem(name: "edit", value: "1")]
        return components.url
    }
}
