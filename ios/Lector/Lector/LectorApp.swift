import SwiftUI

@main
struct LectorApp: App {
    @StateObject private var reader = SpeechReader()

    var body: some Scene {
        WindowGroup {
            ReaderView()
                .environmentObject(reader)
                .onAppear {
                    // Al volver, el último PDF donde lo dejaste (en pausa).
                    reader.restoreLastDocument()
                }
                .onOpenURL { url in
                    // "Compartir ▸ Lector" desde Archivos, Safari, Correo…
                    reader.open(url)
                }
        }
    }
}
