import Foundation

/// Lo poco que hay que recordar entre sesiones: qué PDF estabas oyendo, por
/// dónde ibas y a qué velocidad. Todo en el dispositivo.
enum Library {

    private static let defaults = UserDefaults.standard
    private static let speedKey = "velocidad"
    private static let lastDocumentKey = "ultimoDocumento"
    private static let positionsKey = "posiciones"

    /// Carpeta donde se copian los PDFs abiertos. Al copiarlos dejamos de
    /// depender de permisos de otras apps: el archivo ya es nuestro y sigue ahí
    /// la próxima vez.
    static var booksDirectory: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let books = documents.appendingPathComponent("Libros", isDirectory: true)
        if !FileManager.default.fileExists(atPath: books.path) {
            try? FileManager.default.createDirectory(at: books, withIntermediateDirectories: true)
        }
        return books
    }

    // MARK: Velocidad

    static func savedSpeed() -> Speed {
        let raw = defaults.double(forKey: speedKey)
        return Speed(rawValue: raw) ?? .normal
    }

    static func save(speed: Speed) {
        defaults.set(speed.rawValue, forKey: speedKey)
    }

    // MARK: Posición dentro de cada libro

    /// Posición guardada, en caracteres desde el principio del documento.
    static func position(for id: String) -> Int {
        let positions = defaults.dictionary(forKey: positionsKey) as? [String: Int] ?? [:]
        return positions[id] ?? 0
    }

    static func save(position: Int, for id: String) {
        var positions = defaults.dictionary(forKey: positionsKey) as? [String: Int] ?? [:]
        positions[id] = position
        defaults.set(positions, forKey: positionsKey)
    }

    // MARK: Último documento

    static func lastDocument() -> URL? {
        guard let name = defaults.string(forKey: lastDocumentKey) else { return nil }
        let url = booksDirectory.appendingPathComponent(name)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    static func setLastDocument(_ url: URL?) {
        defaults.set(url?.lastPathComponent, forKey: lastDocumentKey)
    }

    // MARK: Importar

    /// Copia el PDF elegido a la carpeta de la app y devuelve su nueva
    /// ubicación. Si ya estaba (mismo nombre), se reutiliza y así se conserva
    /// la posición de lectura.
    static func importPDF(from url: URL) throws -> URL {
        // Los archivos que llegan del selector o de otra app vienen con
        // permiso temporal; hay que pedirlo explícitamente antes de leerlos.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        let destination = booksDirectory.appendingPathComponent(safeName(from: url))

        // Ya lo tenemos y no ha cambiado: no hace falta copiar nada.
        if FileManager.default.fileExists(atPath: destination.path) {
            if let existing = size(of: destination), let incoming = size(of: url), existing == incoming {
                return destination
            }
            try? FileManager.default.removeItem(at: destination)
        }

        try FileManager.default.copyItem(at: url, to: destination)
        return destination
    }

    private static func size(of url: URL) -> Int? {
        (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int
    }

    private static func safeName(from url: URL) -> String {
        let name = url.lastPathComponent
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
        return name.isEmpty ? "documento.pdf" : name
    }
}
