import SwiftUI

struct RoutinesView: View {
    @EnvironmentObject private var store: Store
    @Binding var editing: EditorTarget?
    let today: Date

    private var dueToday: [Routine] { store.routines.filter { $0.occurs(on: today) } }
    private var notToday: [Routine] { store.routines.filter { !$0.occurs(on: today) } }

    var body: some View {
        List {
            if store.routines.isEmpty {
                Section {
                    EmptyRow(title: "Todavía no hay rutinas",
                             hint: "Una rutina es algo que se repite: la medicación, el gimnasio, sacar la basura…")
                }
            } else {
                if !dueToday.isEmpty {
                    let done = dueToday.filter { $0.isDone(on: today) }.count
                    Section("Hoy · \(done)/\(dueToday.count)") {
                        ForEach(dueToday) { routine in
                            ItemRow(editing: $editing, occurrence: routine.asOccurrence(on: today))
                        }
                    }
                }

                Section("Racha de los últimos 14 días") {
                    ForEach(store.routines) { routine in
                        StreakRow(routine: routine, today: today)
                    }
                }

                if !notToday.isEmpty {
                    Section("Hoy no tocan") {
                        ForEach(notToday) { routine in
                            ItemRow(editing: $editing, occurrence: routine.asOccurrence(on: today))
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        store.deleteRoutine(routine.id)
                                    } label: { Label("Eliminar", systemImage: "trash") }
                                }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Rutinas")
    }
}

/// Cuadrícula de 14 días: verde si se hizo, rojo si tocaba y se dejó pasar.
private struct StreakRow: View {
    let routine: Routine
    let today: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(routine.title).font(.system(size: 15, weight: .medium))
                Spacer()
                Text("\(routine.completions.count) veces")
                    .font(.caption).foregroundStyle(.secondary)
            }
            HStack(spacing: 3) {
                ForEach(days, id: \.self) { day in
                    RoundedRectangle(cornerRadius: 4)
                        .fill(color(for: day))
                        .frame(height: 22)
                        .accessibilityLabel(DateKey.string(from: day))
                }
            }
            HStack(spacing: 3) {
                ForEach(days, id: \.self) { day in
                    Text(weekdayInitials[Calendar.current.component(.weekday, from: day) - 1])
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var days: [Date] {
        (0..<14).reversed().map { today.adding(days: -$0) }
    }

    private func color(for day: Date) -> Color {
        let due = routine.occurs(on: day)
        let done = routine.isDone(on: day)
        if due && done { return .green }
        if due && day.isSameDay(as: today) { return Color.accentColor.opacity(0.35) }
        if due { return Color.red.opacity(0.35) }
        return Color(.tertiarySystemFill)
    }
}
