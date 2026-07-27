import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.scenePhase) private var scenePhase

    @State private var tab = Tab.today
    @State private var editing: EditorTarget?
    /// Se actualiza al volver a primer plano para que "hoy" no se quede colgado.
    @State private var today = Date().startOfDay()

    enum Tab: Hashable { case today, calendar, tasks, routines, settings }

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                TodayView(editing: $editing, today: today)
                    .toolbar { addButton }
            }
            .tabItem { Label("Hoy", systemImage: "clock") }
            .tag(Tab.today)

            NavigationStack {
                CalendarView(editing: $editing)
                    .toolbar { addButton }
            }
            .tabItem { Label("Calendario", systemImage: "calendar") }
            .tag(Tab.calendar)

            NavigationStack {
                TasksView(editing: $editing)
                    .toolbar { addButton }
            }
            .tabItem { Label("Tareas", systemImage: "checklist") }
            .tag(Tab.tasks)

            NavigationStack {
                RoutinesView(editing: $editing, today: today)
                    .toolbar { addButton }
            }
            .tabItem { Label("Rutinas", systemImage: "arrow.triangle.2.circlepath") }
            .tag(Tab.routines)

            NavigationStack {
                SettingsView()
            }
            .tabItem { Label("Ajustes", systemImage: "gearshape") }
            .tag(Tab.settings)
        }
        .sheet(item: $editing) { target in
            EditorView(target: target)
                .environmentObject(store)
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            today = Date().startOfDay()
            NotificationService.shared.reschedule(from: store)
        }
    }

    private var addButton: some ToolbarContent {
        ToolbarItem(placement: .navigationBarTrailing) {
            Button {
                editing = .new(defaultKind, today)
            } label: {
                Image(systemName: "plus.circle.fill").font(.title3)
            }
            .accessibilityLabel("Añadir")
        }
    }

    private var defaultKind: OccurrenceKind {
        switch tab {
        case .calendar: return .event
        case .routines: return .routine
        default: return .task
        }
    }
}
