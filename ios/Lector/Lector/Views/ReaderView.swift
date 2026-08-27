import SwiftUI
import UniformTypeIdentifiers

struct ReaderView: View {
    @EnvironmentObject private var reader: SpeechReader
    @State private var showingImporter = false

    var body: some View {
        NavigationStack {
            Group {
                switch reader.state {
                case .empty:
                    EmptyStateView { showingImporter = true }
                case .loading:
                    LoadingView()
                case .failed(let message):
                    FailureView(message: message) { showingImporter = true }
                case .ready:
                    PlayerView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle(reader.book?.title ?? "Lector")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingImporter = true
                    } label: {
                        Label("Abrir un PDF", systemImage: "doc.badge.plus")
                    }
                }
            }
        }
        .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.pdf]) { result in
            if case .success(let url) = result { reader.open(url) }
        }
    }
}

// MARK: - Pantalla principal

private struct PlayerView: View {
    @EnvironmentObject private var reader: SpeechReader

    var body: some View {
        VStack(spacing: 0) {
            SentenceView()
            Spacer(minLength: 12)

            VStack(spacing: 28) {
                ScrubBar()
                PlayButton()
                SpeedPicker()
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
    }
}

/// Lo que suena ahora mismo, con la palabra en curso resaltada. Es la forma más
/// barata de saber de un vistazo si la barra te ha dejado donde querías.
private struct SentenceView: View {
    @EnvironmentObject private var reader: SpeechReader

    var body: some View {
        ScrollView {
            highlighted
                .font(.system(size: 26, weight: .regular, design: .serif))
                .lineSpacing(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .animation(.easeOut(duration: 0.15), value: reader.currentSentence)
        }
        .scrollIndicators(.hidden)
    }

    private var highlighted: Text {
        let sentence = reader.currentSentence
        guard let range = reader.spokenWord,
              range.lowerBound >= 0,
              range.upperBound <= sentence.count,
              range.lowerBound < range.upperBound else {
            return Text(sentence)
        }
        let start = sentence.index(sentence.startIndex, offsetBy: range.lowerBound)
        let end = sentence.index(sentence.startIndex, offsetBy: range.upperBound)
        return Text(sentence[sentence.startIndex..<start])
            + Text(sentence[start..<end]).foregroundColor(.accentColor)
            + Text(sentence[end...])
    }
}

/// Opción 1: la línea para ir hacia atrás y hacia adelante.
private struct ScrubBar: View {
    @EnvironmentObject private var reader: SpeechReader
    @State private var scrubbing = false
    @State private var scrubValue = 0.0

    var body: some View {
        VStack(spacing: 6) {
            Slider(
                value: Binding(
                    get: { scrubbing ? scrubValue : reader.progress },
                    set: { scrubValue = $0 }
                ),
                in: 0...1,
                onEditingChanged: { editing in
                    if editing {
                        scrubValue = reader.progress
                        scrubbing = true
                    } else {
                        scrubbing = false
                        reader.seek(to: scrubValue)
                    }
                }
            )
            .tint(.accentColor)
            .accessibilityLabel("Posición")
            .accessibilityValue("\(Int((scrubbing ? scrubValue : reader.progress) * 100)) por ciento")

            HStack {
                Text(TimeLabel.short(elapsed))
                Spacer()
                if let book = reader.book {
                    Text("Página \(reader.currentPage) de \(book.pageCount)")
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                Text("−" + TimeLabel.short(remaining))
            }
            .font(.footnote.monospacedDigit())
            .foregroundStyle(.secondary)
        }
    }

    /// Mientras se arrastra, los tiempos siguen al dedo y no a la voz.
    private var fraction: Double { scrubbing ? scrubValue : reader.progress }

    private var elapsed: Double {
        guard let total = reader.estimatedTotalSeconds else { return 0 }
        return total * fraction
    }

    private var remaining: Double {
        guard let total = reader.estimatedTotalSeconds else { return 0 }
        return total * (1 - fraction)
    }
}

private struct PlayButton: View {
    @EnvironmentObject private var reader: SpeechReader

    var body: some View {
        Button {
            reader.togglePlay()
        } label: {
            Image(systemName: reader.isPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 34))
                .foregroundStyle(.white)
                .frame(width: 84, height: 84)
                .background(Circle().fill(Color.accentColor))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(reader.isPlaying ? "Pausa" : "Reproducir")
    }
}

/// Opción 2: las seis velocidades.
private struct SpeedPicker: View {
    @EnvironmentObject private var reader: SpeechReader

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Speed.allCases) { speed in
                SpeedButton(speed: speed, selected: speed == reader.speed) {
                    reader.speed = speed
                }
            }
        }
    }
}

private struct SpeedButton: View {
    let speed: Speed
    let selected: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(speed.label)
                .font(.subheadline.weight(selected ? .semibold : .regular))
                .monospacedDigit()
                .frame(maxWidth: .infinity, minHeight: 38)
                .foregroundStyle(selected ? Color.white : Color.primary)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(selected ? Color.accentColor : Color(.secondarySystemBackground))
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Velocidad \(speed.label)")
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

// MARK: - Estados sin libro

private struct EmptyStateView: View {
    var open: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "headphones")
                .font(.system(size: 64))
                .foregroundStyle(.secondary)
            Text("Elige un PDF y te lo leo")
                .font(.title3)
            Button(action: open) {
                Text("Abrir un PDF")
                    .font(.headline)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}

private struct LoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Sacando el texto del PDF…")
                .foregroundStyle(.secondary)
        }
    }
}

private struct FailureView: View {
    let message: String
    var open: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundStyle(.orange)
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button("Probar con otro PDF", action: open)
                .buttonStyle(.bordered)
        }
        .padding(32)
    }
}

// MARK: - Tiempos

enum TimeLabel {
    /// "4:05" o "1:23:45".
    static func short(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, secs)
            : String(format: "%d:%02d", minutes, secs)
    }
}
