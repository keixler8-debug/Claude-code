import SwiftUI

struct TasksView: View {
    @EnvironmentObject private var store: Store
    @Binding var editing: EditorTarget?

    enum Filter: String, CaseIterable, Identifiable {
        case pending = "Pendientes", done = "Hechas", all = "Todas"
        var id: String { rawValue }
    }

    @State private var filter: Filter = .pending

    var body: some View {
        List {
            Section {
                Picker("Filtro", selection: $filter) {
                    ForEach(Filter.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
            }

            if grouped.allSatisfy(\.tasks.isEmpty) {
                Section {
                    EmptyRow(title: "Sin tareas aquí",
                             hint: "Las tareas puntuales son las que se hacen una vez y se acaban.")
                }
            } else {
                ForEach(grouped, id: \.name) { group in
                    if !group.tasks.isEmpty {
                        Section("\(group.name) · \(group.tasks.count)") {
                            ForEach(group.tasks) { task in
                                ItemRow(editing: $editing, occurrence: task.asOccurrence, showDate: true)
                                    .swipeActions(edge: .trailing) {
                                        Button(role: .destructive) {
                                            store.deleteTask(task.id)
                                        } label: { Label("Eliminar", systemImage: "trash") }
                                    }
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Tareas")
    }

    private var visible: [TaskItem] {
        switch filter {
        case .pending: return store.tasks.filter { !$0.done }
        case .done: return store.tasks.filter(\.done)
        case .all: return store.tasks
        }
    }

    private var grouped: [(name: String, tasks: [TaskItem])] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        var overdue: [TaskItem] = [], todayTasks: [TaskItem] = [], week: [TaskItem] = []
        var later: [TaskItem] = [], undated: [TaskItem] = []

        for task in visible.sorted(by: { ($0.due ?? .distantFuture) < ($1.due ?? .distantFuture) }) {
            guard let due = task.due else { undated.append(task); continue }
            let days = calendar.dateComponents([.day], from: today, to: calendar.startOfDay(for: due)).day ?? 0
            if days < 0 { (task.done ? later : overdue).append(task) }
            else if days == 0 { todayTasks.append(task) }
            else if days <= 7 { week.append(task) }
            else { later.append(task) }
        }

        return [
            ("Atrasadas", overdue), ("Hoy", todayTasks), ("Esta semana", week),
            ("Más adelante", later), ("Sin fecha", undated),
        ]
    }
}
