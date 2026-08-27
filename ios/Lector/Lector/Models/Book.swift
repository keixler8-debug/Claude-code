import Foundation
import NaturalLanguage
import PDFKit

/// Un trozo de texto que se lee de una vez: normalmente una frase, o un pedazo
/// de frase si era larguísima. Es la unidad mínima a la que puede saltar la
/// barra de posición.
struct Chunk {
    /// El texto que se pronuncia.
    let text: String
    /// Desplazamiento en caracteres desde el principio del documento. Es lo que
    /// convierte la barra (0…1) en una posición concreta.
    let start: Int
    /// Página del PDF de la que salió, empezando en 1.
    let page: Int

    var length: Int { text.count }
    var end: Int { start + length }
}

/// Un PDF ya convertido en frases, listo para leer en voz alta.
struct Book {
    /// Clave estable para recordar por dónde ibas: el nombre del archivo
    /// dentro de la carpeta de la app.
    let id: String
    let title: String
    let url: URL
    let chunks: [Chunk]
    let totalCharacters: Int
    let pageCount: Int
    /// Idioma detectado ("es", "en"…). Sirve para elegir la voz.
    let language: String

    /// Índice de la frase que contiene un carácter dado. Búsqueda binaria
    /// porque un libro largo tiene decenas de miles de frases.
    func index(forCharacter character: Int) -> Int {
        guard !chunks.isEmpty else { return 0 }
        var low = 0
        var high = chunks.count - 1
        while low < high {
            let mid = (low + high) / 2
            if chunks[mid].end <= character {
                low = mid + 1
            } else {
                high = mid
            }
        }
        return low
    }
}

enum BookError: LocalizedError {
    case cannotOpen
    case noText

    var errorDescription: String? {
        switch self {
        case .cannotOpen:
            return "No he podido abrir el PDF. Puede que esté protegido con contraseña o dañado."
        case .noText:
            return "Este PDF no tiene texto: parece un escaneo (páginas en imagen). Para poder leerlo hay que pasarle antes un OCR."
        }
    }
}

/// Saca el texto de un PDF y lo parte en frases.
enum PDFTextExtractor {

    /// Frases más largas que esto se parten en trozos. Dos motivos: la barra de
    /// posición gana precisión y el motor de voz tarda menos en arrancar.
    private static let maxChunkLength = 280

    static func load(url: URL) throws -> Book {
        guard let document = PDFDocument(url: url) else { throw BookError.cannotOpen }

        var chunks: [Chunk] = []
        var cursor = 0
        var sample = ""

        for pageIndex in 0..<document.pageCount {
            guard let page = document.page(at: pageIndex),
                  let raw = page.string else { continue }
            let text = clean(raw)
            guard !text.isEmpty else { continue }
            if sample.count < 2_000 { sample += text + " " }

            for sentence in sentences(in: text) {
                for piece in split(sentence, max: maxChunkLength) {
                    let trimmed = piece.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty, trimmed.contains(where: \.isLetter) || trimmed.contains(where: \.isNumber) else { continue }
                    chunks.append(Chunk(text: trimmed, start: cursor, page: pageIndex + 1))
                    cursor += trimmed.count + 1
                }
            }
        }

        guard !chunks.isEmpty else { throw BookError.noText }

        let title = document.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String
        return Book(
            id: url.lastPathComponent,
            title: prettyTitle(title, fallback: url.deletingPathExtension().lastPathComponent),
            url: url,
            chunks: chunks,
            totalCharacters: max(cursor, 1),
            pageCount: document.pageCount,
            language: detectLanguage(in: sample)
        )
    }

    // MARK: Limpieza

    /// El texto que devuelve PDFKit viene cortado línea a línea, tal y como se
    /// ve en la página. Si se lee así, la voz hace una pausa en cada salto y
    /// las palabras partidas con guion suenan a trabalenguas. Esto vuelve a
    /// pegar los párrafos.
    private static func clean(_ raw: String) -> String {
        let lines = raw
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }

        var out = ""
        for line in lines {
            if line.isEmpty {
                if !out.isEmpty && !out.hasSuffix("\n") { out += "\n" }
                continue
            }
            // Números de página sueltos: no aportan nada leídos en voz alta.
            if isPageNumber(line) { continue }

            if out.isEmpty || out.hasSuffix("\n") {
                out += line
            } else if let last = out.last, last == "-" || last == "\u{00AD}" || last == "\u{2010}" {
                // Palabra partida al final de la línea: se vuelve a unir.
                out.removeLast()
                out += line
            } else {
                out += " " + line
            }
        }
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func isPageNumber(_ line: String) -> Bool {
        guard line.count <= 12 else { return false }
        let letters = line.filter { $0.isLetter }
        let digits = line.filter { $0.isNumber }
        guard !digits.isEmpty else { return false }
        // "24", "- 24 -", "Página 24", "24 de 300".
        let allowed = Set("PpáAaGgIiNnaAeEdD")
        return letters.allSatisfy { allowed.contains($0) }
    }

    // MARK: Troceado

    private static func sentences(in text: String) -> [String] {
        var result: [String] = []
        text.enumerateSubstrings(in: text.startIndex..<text.endIndex,
                                 options: [.bySentences, .localized]) { substring, _, _, _ in
            if let substring, !substring.isEmpty { result.append(substring) }
        }
        // Si el detector de frases no encuentra ninguna (texto sin puntuación),
        // al menos devolvemos el bloque entero para no perderlo.
        return result.isEmpty ? [text] : result
    }

    /// Parte una frase larga por comas, y si aun así no cabe, por palabras.
    private static func split(_ text: String, max: Int) -> [String] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > max else { return [trimmed] }

        var parts: [String] = []
        var current = ""

        for word in trimmed.split(separator: " ", omittingEmptySubsequences: true) {
            if !current.isEmpty && current.count + 1 + word.count > max {
                parts.append(current)
                current = String(word)
            } else {
                current = current.isEmpty ? String(word) : current + " " + word
            }
            // Cortar en una coma queda mucho más natural que cortar a mitad de
            // una oración subordinada.
            if current.count >= max * 2 / 3, let last = current.last,
               last == "," || last == ";" || last == ":" {
                parts.append(current)
                current = ""
            }
        }
        if !current.isEmpty { parts.append(current) }
        return parts
    }

    // MARK: Idioma y título

    private static func detectLanguage(in sample: String) -> String {
        guard !sample.isEmpty else { return "es" }
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(sample)
        guard let language = recognizer.dominantLanguage else { return "es" }
        return language.rawValue
    }

    private static func prettyTitle(_ title: String?, fallback: String) -> String {
        if let title {
            let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
            // Muchos PDFs traen aquí basura del programa que los generó.
            if trimmed.count > 2, !trimmed.lowercased().hasSuffix(".dvi"), !trimmed.lowercased().hasSuffix(".indd") {
                return trimmed
            }
        }
        return fallback
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
            .trimmingCharacters(in: .whitespaces)
    }
}
