import SwiftUI

/// Fila conectada al almacén: sabe marcar y abrir el editor por sí sola.
struct ItemRow: View {
    @EnvironmentObject private var store: Store
    @Binding var editing: EditorTarget?

    let occurrence: Occurrence
    var showDate: Bool = false

    var body: some View {
        OccurrenceRow(
            occurrence: occurrence,
            showDate: showDate,
            onToggle: toggle,
            onEdit: edit
        )
    }

    private func toggle() {
        switch occurrence.kind {
        case .task:
            store.toggleTask(occurrence.sourceID)
        case .routine:
            store.toggleRoutine(occurrence.sourceID, on: DateKey.date(from: occurrence.dayKey) ?? Date())
        case .event:
            break
        }
    }

    private func edit() {
        switch occurrence.kind {
        case .event:
            if let e = store.events.first(where: { $0.id == occurrence.sourceID }) { editing = .event(e) }
        case .task:
            if let t = store.tasks.first(where: { $0.id == occurrence.sourceID }) { editing = .task(t) }
        case .routine:
            if let r = store.routines.first(where: { $0.id == occurrence.sourceID }) { editing = .routine(r) }
        }
    }
}

extension TaskItem {
    /// Convierte una tarea suelta (sin día concreto) en algo pintable.
    var asOccurrence: Occurrence {
        Occurrence(
            id: "task-\(id)", kind: .task, title: title, notes: notes,
            start: allDay ? nil : due, end: nil, allDay: due == nil || allDay,
            done: done, overdue: due.map { !done && $0 < Date() } ?? false,
            alarms: alarms, color: color, ruleDescription: nil,
            sourceID: id, dayKey: due.map(DateKey.string(from:)) ?? "")
    }
}

extension Routine {
    /// La ocurrencia de esta rutina en un día concreto.
    func asOccurrence(on day: Date) -> Occurrence {
        let start = timeOfDay.flatMap { comps in
            day.startOfDay().at(hour: comps.hour ?? 0, minute: comps.minute ?? 0)
        }
        let isDone = isDone(on: day)
        return Occurrence(
            id: "routine-\(id)-\(DateKey.string(from: day))", kind: .routine, title: title, notes: notes,
            start: start, end: nil, allDay: start == nil,
            done: isDone, overdue: !isDone && (start.map { $0 < Date() } ?? false),
            alarms: alarms, color: color, ruleDescription: rule.describedInSpanish,
            sourceID: id, dayKey: DateKey.string(from: day))
    }
}

/// Fila vacía con mensaje, para listas sin contenido.
struct EmptyRow: View {
    let title: String
    let hint: String

    var body: some View {
        VStack(spacing: 4) {
            Text(title).font(.headline)
            Text(hint).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
    }
}
