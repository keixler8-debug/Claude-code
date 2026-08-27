import AVFoundation
import Foundation

/// Las seis velocidades. Ni una más: era el requisito.
enum Speed: Double, CaseIterable, Identifiable, Codable {
    case slowest = 0.75
    case normal = 1.0
    case fast = 1.25
    case faster = 1.5
    case evenFaster = 1.75
    case fastest = 2.0

    var id: Double { rawValue }

    /// "1,25×" con coma decimal, que es como se escribe en español.
    var label: String {
        let number = rawValue == rawValue.rounded()
            ? String(Int(rawValue))
            : String(format: "%g", rawValue).replacingOccurrences(of: ".", with: ",")
        return number + "×"
    }

    /// `AVSpeechUtteranceDefaultRate` (0,5) es el "1×" del sistema, así que la
    /// velocidad elegida es un multiplicador sobre esa. En 2× se llega justo al
    /// máximo que admite el motor.
    var utteranceRate: Float {
        let rate = AVSpeechUtteranceDefaultRate * Float(rawValue)
        return min(max(rate, AVSpeechUtteranceMinimumSpeechRate), AVSpeechUtteranceMaximumSpeechRate)
    }

    /// Caracteres por segundo aproximados, para estimar cuánto queda. Una voz
    /// del sistema a 1× ronda las 160 palabras por minuto y una palabra en
    /// español anda por los 5,5 caracteres.
    var charactersPerSecond: Double { 15.0 * rawValue }
}
