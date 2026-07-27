import SwiftUI
import UserNotifications
import UniformTypeIdentifiers

struct SettingsView: View {
    @EnvironmentObject private var store: Store

    @State private var authorization: UNAuthorizationStatus = .notDetermined
    @State private var pending = 0
    @State private var shareURL: URL?
    @State private var showImporter = false
    @State private var showClearConfirm = false
    @State private var message: String?

    var body: some View {
        List {
            Section {
                statusRow
                if authorization != .authorized {
                    Button("Permitir notificaciones") {
                        Task {
                            _ = await NotificationService.shared.requestAuthorization()
                            store.settings.notificationsRequested = true
                            store.didChange()
                            await refresh()
                        }
                    }
                }
                Button("Probar una alarma en 10 segundos", action: testAlarm)
            } header: {
                Text("Alarmas")
            } footer: {
                Text("Las alarmas son notificaciones locales: suenan con el iPhone bloqueado y sin conexión. "
                     + "iOS admite un máximo de 64 avisos programados a la vez; la app programa siempre los más cercanos.")
            }

            Section {
                Button("Compartir mi calendario (.ics)", action: share)
                Button("Importar un archivo .ics") { showImporter = true }
            } header: {
                Text("Intercambio con otras apps")
            } footer: {
                Text("El .ics sirve para pasar tu agenda al Calendario de iOS o a la versión web de esta app.")
            }

            Section("Preferencias") {
                TextField("Nombre del calendario", text: Binding(
                    get: { store.settings.calendarName },
                    set: { store.settings.calendarName = $0; store.scheduleSave() }
                ))
                Picker("La semana empieza en", selection: Binding(
                    get: { store.settings.firstWeekday },
                    set: { store.settings.firstWeekday = $0; store.scheduleSave() }
                )) {
                    Text("Lunes").tag(2)
                    Text("Domingo").tag(1)
                }
                defaultAlarmsPicker
            }

            Section {
                Text("\(store.events.count) eventos · \(store.tasks.count) tareas · \(store.routines.count) rutinas")
                    .foregroundStyle(.secondary)
                Button("Borrar todo", role: .destructive) { showClearConfirm = true }
            } header: {
                Text("Tus datos")
            } footer: {
                Text("Todo se guarda solo en este iPhone. No hay cuentas ni servidores.")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Ajustes")
        .task { await refresh() }
        .sheet(item: Binding(get: { shareURL.map(ShareItem.init) }, set: { shareURL = $0?.url })) { item in
            ShareSheet(items: [item.url])
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [UTType(filenameExtension: "ics") ?? .data]) { result in
            handleImport(result)
        }
        .confirmationDialog("¿Borrar todos tus datos?", isPresented: $showClearConfirm, titleVisibility: .visible) {
            Button("Borrar todo", role: .destructive) { store.clearAll() }
            Button("Cancelar", role: .cancel) {}
        }
        .alert("Organizador", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("Vale", role: .cancel) {}
        } message: {
            Text(message ?? "")
        }
    }

    private var statusRow: some View {
        HStack {
            Text("Permiso del sistema")
            Spacer()
            Text(statusText)
                .foregroundStyle(authorization == .authorized ? .green : .secondary)
        }
    }

    private var statusText: String {
        switch authorization {
        case .authorized, .provisional, .ephemeral: return "Concedido · \(pending) programadas"
        case .denied: return "Denegado — actívalo en Ajustes de iOS"
        default: return "Sin conceder"
        }
    }

    private var defaultAlarmsPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Alarmas por defecto").font(.footnote).foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 78), spacing: 8)], spacing: 8) {
                ForEach(alarmPresets.prefix(6), id: \.minutes) { preset in
                    let active = store.settings.defaultAlarms.contains(preset.minutes)
                    Button {
                        if active { store.settings.defaultAlarms.removeAll { $0 == preset.minutes } }
                        else { store.settings.defaultAlarms = (store.settings.defaultAlarms + [preset.minutes]).sorted() }
                        store.scheduleSave()
                    } label: {
                        Text(preset.label)
                            .font(.footnote.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 32)
                            .background(active ? Color.accentColor : Color(.tertiarySystemFill), in: Capsule())
                            .foregroundStyle(active ? .white : .primary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: Acciones

    private func refresh() async {
        authorization = await NotificationService.shared.authorizationStatus()
        pending = await NotificationService.shared.pendingCount()
    }

    private func testAlarm() {
        let content = UNMutableNotificationContent()
        content.title = "Prueba de alarma"
        content.body = "Si oyes esto, las alarmas funcionan."
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 10, repeats: false)
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: "prueba", content: content, trigger: trigger))
        message = "Bloquea el iPhone: sonará en 10 segundos."
    }

    private func share() {
        do {
            shareURL = try ICSService.writeTemporaryFile(store: store)
        } catch {
            message = "No pude generar el archivo: \(error.localizedDescription)"
        }
    }

    private func handleImport(_ result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            let needsScope = url.startAccessingSecurityScopedResource()
            defer { if needsScope { url.stopAccessingSecurityScopedResource() } }
            guard let text = try? String(contentsOf: url, encoding: .utf8) else {
                message = "No pude leer el archivo."
                return
            }
            let imported = ICSService.parse(text)
            guard !imported.isEmpty else {
                message = "No encontré eventos en ese archivo."
                return
            }
            store.events.append(contentsOf: imported.events)
            store.routines.append(contentsOf: imported.routines)
            store.didChange()
            message = "Importados \(imported.events.count) eventos y \(imported.routines.count) rutinas."
        case .failure(let error):
            message = "No se pudo abrir: \(error.localizedDescription)"
        }
    }
}

private struct ShareItem: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// Puente mínimo al menú de compartir de iOS.
private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
