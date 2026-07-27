import SwiftUI

@main
struct OrganizadorApp: App {
    @StateObject private var store = Store()

    init() {
        NotificationService.shared.configureAsDelegate()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .task {
                    // La primera vez pedimos permiso; después basta con reprogramar.
                    if !store.settings.notificationsRequested {
                        _ = await NotificationService.shared.requestAuthorization()
                        store.settings.notificationsRequested = true
                    }
                    NotificationService.shared.reschedule(from: store)
                }
        }
    }
}
