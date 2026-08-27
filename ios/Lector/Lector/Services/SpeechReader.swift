import AVFoundation
import Combine
import Foundation

/// El motor de la app: convierte un `Book` en voz y lleva la cuenta de por
/// dónde va, que es lo que mueve la barra de posición.
///
/// Todo lo público de esta clase se usa desde el hilo principal (la vista y los
/// avisos de `AVSpeechSynthesizer`, que llegan ahí).
final class SpeechReader: NSObject, ObservableObject {

    enum State: Equatable {
        case empty
        case loading
        case ready
        case failed(String)
    }

    @Published private(set) var state: State = .empty
    @Published private(set) var book: Book?
    @Published private(set) var isPlaying = false

    /// Posición dentro del documento, de 0 a 1. Es lo que pinta y mueve la barra.
    @Published private(set) var progress: Double = 0
    /// La frase que suena ahora mismo.
    @Published private(set) var currentSentence: String = ""
    /// Rango de la palabra que se está pronunciando, en caracteres dentro de
    /// `currentSentence`. Se publica como enteros (y no como índices de String)
    /// para que la vista no pueda usarlos contra otra cadena.
    @Published private(set) var spokenWord: Range<Int>?

    @Published var speed: Speed = Library.savedSpeed() {
        didSet {
            guard speed != oldValue else { return }
            Library.save(speed: speed)
            // La velocidad se fija al crear cada frase, así que para que el
            // cambio se note ya hay que rehacer lo que estuviera en cola.
            if isPlaying {
                start(at: position)
            } else {
                stopEngine()
            }
            updateNowPlaying()
        }
    }

    // MARK: Estado interno

    /// Dónde estamos: en qué frase y cuántos caracteres llevamos dentro de ella.
    struct Position {
        var chunk: Int = 0
        var charBase: Int = 0
    }

    /// Una frase entregada al motor de voz.
    private struct Queued {
        let chunk: Int
        /// Caracteres de la frase que se saltaron (al reanudar a media frase).
        let charBase: Int
        /// El texto que se le pasó al motor: la frase, o lo que queda de ella.
        let text: String
    }

    private let synthesizer = AVSpeechSynthesizer()
    private var voice: AVSpeechSynthesisVoice?
    private var queued: [ObjectIdentifier: Queued] = [:]
    private var nextToEnqueue = 0
    private var position = Position()
    private var sessionActivated = false

    /// Cuántas frases van por delante en la cola del motor. Con más de una no
    /// se oye el silencio entre frase y frase.
    private let lookahead = 3

    override init() {
        super.init()
        synthesizer.delegate = self
        setUpRemoteCommands()
        observeAudioSession()
    }

    // MARK: Abrir un PDF

    /// Reabre el último PDF, en la posición en la que se dejó, pero en pausa.
    func restoreLastDocument() {
        guard book == nil, let url = Library.lastDocument() else { return }
        load(url, importing: false)
    }

    func open(_ url: URL) {
        load(url, importing: true)
    }

    private func load(_ url: URL, importing: Bool) {
        stopEngine()
        isPlaying = false
        state = .loading
        currentSentence = ""
        spokenWord = nil
        progress = 0

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                let stored = importing ? try Library.importPDF(from: url) : url
                let book = try PDFTextExtractor.load(url: stored)
                DispatchQueue.main.async { self?.opened(book) }
            } catch {
                let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                DispatchQueue.main.async { self?.state = .failed(message) }
            }
        }
    }

    private func opened(_ book: Book) {
        self.book = book
        voice = SpeechReader.bestVoice(for: book.language)
        Library.setLastDocument(book.url)

        // Volvemos a donde lo dejaste, al principio de esa frase.
        let saved = Library.position(for: book.id)
        position = Position(chunk: book.index(forCharacter: saved), charBase: 0)
        nextToEnqueue = position.chunk
        currentSentence = book.chunks[min(position.chunk, book.chunks.count - 1)].text
        spokenWord = nil
        state = .ready
        updateProgress()
        updateNowPlaying()
    }

    // MARK: Los mandos

    func play() {
        guard state == .ready, book != nil else { return }
        activateSession()

        if synthesizer.isPaused {
            synthesizer.continueSpeaking()
        } else if !synthesizer.isSpeaking {
            // Si se había acabado el libro, se empieza otra vez desde arriba.
            if progress >= 0.999 { position = Position() }
            start(at: position)
        }
        isPlaying = true
        updateNowPlaying()
    }

    func pause() {
        synthesizer.pauseSpeaking(at: .word)
        isPlaying = false
        saveProgress()
        updateNowPlaying()
    }

    func togglePlay() {
        isPlaying ? pause() : play()
    }

    /// Saltar a un punto de la barra (0…1). Cae siempre al principio de una
    /// frase: empezar a media frase suena a que te has perdido algo.
    func seek(to fraction: Double) {
        guard let book else { return }
        let target = Int((Double(book.totalCharacters) * min(max(fraction, 0), 1)).rounded())
        let index = min(book.index(forCharacter: target), book.chunks.count - 1)
        move(to: Position(chunk: index, charBase: 0))
    }

    /// Adelantar o retroceder unos segundos (los mandos de la pantalla de
    /// bloqueo y los auriculares).
    func skip(seconds: Double) {
        guard let book else { return }
        let characters = spokenCharacters + Int(seconds * speed.charactersPerSecond)
        let clamped = min(max(characters, 0), book.totalCharacters)
        move(to: Position(chunk: min(book.index(forCharacter: clamped), book.chunks.count - 1), charBase: 0))
    }

    private func move(to newPosition: Position) {
        guard let book, !book.chunks.isEmpty else { return }
        position = newPosition
        nextToEnqueue = newPosition.chunk
        currentSentence = book.chunks[min(newPosition.chunk, book.chunks.count - 1)].text
        spokenWord = nil
        updateProgress()
        saveProgress()

        if isPlaying {
            start(at: position)
        } else {
            stopEngine()
        }
        updateNowPlaying()
    }

    // MARK: Motor de voz

    private func start(at position: Position) {
        guard let book, position.chunk < book.chunks.count else {
            finish()
            return
        }
        stopEngine()

        let chunk = book.chunks[position.chunk]
        let base = min(max(position.charBase, 0), max(chunk.length - 1, 0))
        let text = base == 0 ? chunk.text : String(chunk.text.dropFirst(base))

        self.position = Position(chunk: position.chunk, charBase: base)
        currentSentence = chunk.text
        nextToEnqueue = position.chunk + 1
        updateProgress()

        speak(Queued(chunk: position.chunk, charBase: base, text: text))
        fillQueue()
    }

    private func fillQueue() {
        guard let book else { return }
        while queued.count < lookahead && nextToEnqueue < book.chunks.count {
            let chunk = book.chunks[nextToEnqueue]
            speak(Queued(chunk: nextToEnqueue, charBase: 0, text: chunk.text))
            nextToEnqueue += 1
        }
    }

    private func speak(_ item: Queued) {
        let utterance = AVSpeechUtterance(string: item.text)
        utterance.voice = voice
        utterance.rate = speed.utteranceRate
        queued[ObjectIdentifier(utterance)] = item
        synthesizer.speak(utterance)
    }

    private func stopEngine() {
        queued.removeAll()
        // Parar mientras está en pausa no siempre funciona: hay que reanudar un
        // instante antes. El corte es inmediato, así que no se llega a oír.
        if synthesizer.isPaused { synthesizer.continueSpeaking() }
        synthesizer.stopSpeaking(at: .immediate)
    }

    private func finish() {
        stopEngine()
        isPlaying = false
        progress = 1
        spokenWord = nil
        saveProgress()
        updateNowPlaying()
    }

    // MARK: Posición

    /// Caracteres leídos desde el principio del documento.
    var spokenCharacters: Int {
        guard let book, !book.chunks.isEmpty else { return 0 }
        let chunk = book.chunks[min(position.chunk, book.chunks.count - 1)]
        return min(chunk.start + position.charBase, book.totalCharacters)
    }

    /// Página del PDF por la que va la lectura.
    var currentPage: Int {
        guard let book, !book.chunks.isEmpty else { return 0 }
        return book.chunks[min(position.chunk, book.chunks.count - 1)].page
    }

    /// Estimación de lo que queda, en segundos. Es una cuenta a ojo a partir de
    /// los caracteres que faltan; el tiempo real depende de la voz.
    var remainingSeconds: Double {
        guard let book else { return 0 }
        return Double(max(book.totalCharacters - spokenCharacters, 0)) / speed.charactersPerSecond
    }

    var elapsedSeconds: Double {
        Double(spokenCharacters) / speed.charactersPerSecond
    }

    /// Los avisos de `AVSpeechSynthesizer` llegan casi siempre en el hilo
    /// principal, pero Apple no lo promete y aquí se tocan propiedades
    /// `@Published`. Si ya estamos en el principal se ejecuta en el sitio, para
    /// no alterar el orden de los avisos.
    fileprivate func onMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    private func updateProgress() {
        guard let book, book.totalCharacters > 0 else {
            progress = 0
            return
        }
        progress = min(max(Double(spokenCharacters) / Double(book.totalCharacters), 0), 1)
    }

    private func saveProgress() {
        guard let book else { return }
        Library.save(position: spokenCharacters, for: book.id)
    }

    // MARK: Voz

    /// La mejor voz instalada para el idioma del documento. Si el sistema tiene
    /// descargada una voz "mejorada" o "premium" se nota muchísimo.
    private static func bestVoice(for language: String) -> AVSpeechSynthesisVoice? {
        // A igualdad de calidad, la variante del idioma del propio iPhone.
        let preferred = Locale.current.identifier.replacingOccurrences(of: "_", with: "-")

        let scored = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix(language) }
            .map { voice -> (voice: AVSpeechSynthesisVoice, score: Int) in
                var score: Int
                switch voice.quality {
                case .premium: score = 30
                case .enhanced: score = 20
                default: score = 10
                }
                if preferred.hasPrefix(voice.language) { score += 5 }
                return (voice, score)
            }

        if let best = scored.max(by: { $0.score < $1.score })?.voice { return best }
        return AVSpeechSynthesisVoice(language: language) ?? AVSpeechSynthesisVoice(language: "es-ES")
    }

    // MARK: Sesión de audio

    private func activateSession() {
        guard !sessionActivated else { return }
        let session = AVAudioSession.sharedInstance()
        do {
            // `.playback` es lo que permite seguir sonando con la pantalla
            // apagada; `.spokenAudio` avisa al sistema de que esto es un
            // audiolibro (por ejemplo, para pausar en vez de bajar el volumen).
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
            sessionActivated = true
        } catch {
            print("No he podido activar el audio: \(error.localizedDescription)")
        }
    }

    private func observeAudioSession() {
        let center = NotificationCenter.default
        center.addObserver(self,
                           selector: #selector(handleInterruption(_:)),
                           name: AVAudioSession.interruptionNotification,
                           object: nil)
        center.addObserver(self,
                           selector: #selector(handleRouteChange(_:)),
                           name: AVAudioSession.routeChangeNotification,
                           object: nil)
    }

    /// Una llamada, una alarma… se pausa y, si el sistema lo permite, se
    /// reanuda al terminar.
    @objc private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }

        switch type {
        case .began:
            // El sistema nos ha quitado la sesión de audio: hay que volver a
            // pedirla antes de reanudar.
            sessionActivated = false
            if isPlaying { pause() }
        case .ended:
            let options = AVAudioSession.InterruptionOptions(
                rawValue: info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
            if options.contains(.shouldResume) { play() }
        @unknown default:
            break
        }
    }

    /// Al quitarse los auriculares se para, como hace cualquier reproductor.
    @objc private func handleRouteChange(_ notification: Notification) {
        guard let info = notification.userInfo,
              let raw = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
        if isPlaying { pause() }
    }
}

// MARK: - Avisos del motor de voz

extension SpeechReader: AVSpeechSynthesizerDelegate {

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           didStart utterance: AVSpeechUtterance) {
        onMain { [weak self] in
            guard let self,
                  let item = self.queued[ObjectIdentifier(utterance)],
                  let book = self.book else { return }
            self.position = Position(chunk: item.chunk, charBase: item.charBase)
            self.currentSentence = book.chunks[item.chunk].text
            self.spokenWord = nil
            self.updateProgress()
            self.updateNowPlaying()
        }
    }

    /// Llega palabra a palabra: es lo que hace avanzar la barra suavemente y lo
    /// que permite resaltar lo que suena.
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           willSpeakRangeOfSpeechString characterRange: NSRange,
                           utterance: AVSpeechUtterance) {
        onMain { [weak self] in
            guard let self,
                  let item = self.queued[ObjectIdentifier(utterance)],
                  let book = self.book,
                  let range = Range(characterRange, in: item.text) else { return }

            let offset = item.text.distance(from: item.text.startIndex, to: range.lowerBound)
            let length = item.text.distance(from: range.lowerBound, to: range.upperBound)

            self.position = Position(chunk: item.chunk, charBase: item.charBase + offset)
            let sentence = book.chunks[item.chunk].text
            if self.currentSentence != sentence { self.currentSentence = sentence }

            let lower = min(item.charBase + offset, sentence.count)
            self.spokenWord = lower..<min(lower + length, sentence.count)
            self.updateProgress()
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           didFinish utterance: AVSpeechUtterance) {
        onMain { [weak self] in
            guard let self,
                  let item = self.queued.removeValue(forKey: ObjectIdentifier(utterance)),
                  let book = self.book else { return }

            // La frase siguiente ya está sonando; la posición pasa a ser su
            // principio para que una pausa justo aquí no repita nada.
            let next = item.chunk + 1
            if next < book.chunks.count {
                self.position = Position(chunk: next, charBase: 0)
                self.updateProgress()
                self.saveProgress()
                self.fillQueue()
            } else if self.queued.isEmpty {
                self.finish()
            }
            self.updateNowPlaying()
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           didCancel utterance: AVSpeechUtterance) {
        onMain { [weak self] in
            self?.queued.removeValue(forKey: ObjectIdentifier(utterance))
        }
    }
}
