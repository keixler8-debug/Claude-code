import Foundation
import Combine

/// Fuente única de verdad. Guarda en un JSON dentro de la carpeta Documentos
/// de la app: nada sale del dispositivo.
@MainActor
final class Store: ObservableObject {
    @Published var events: [Event] = []
    @Published var tasks: [TaskItem] = []
    @Published var routines: [Routine] = []
    @Published var settings = Settings()

    struct Settings: Codable {
        var defaultAlarms: [Int] = [10]
        var calendarName: String = "Mi Organizador"
        /// 1 = domingo, 2 = lunes (igual que `Calendar.firstWeekday`).
        var firstWeekday: Int = 2
        var notificationsRequested: Bool = false
    }

    private struct Snapshot: Codable {
        var events: [Event]
        var tasks: [TaskItem]
        var routines: [Routine]
        var settings: Settings
    }

    private var saveTask: Task<Void, Never>?
    private let fileURL: URL

    init(filename: String = "organizador.json") {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        fileURL = docs.appendingPathComponent(filename)
        load()
    }

    // MARK: Persistencia

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let snapshot = try? decoder.decode(Snapshot.self, from: data) else {
            print("No pude leer \(fileURL.lastPathComponent); empiezo de cero.")
            return
        }
        events = snapshot.events
        tasks = snapshot.tasks
        routines = snapshot.routines
        settings = snapshot.settings
    }

    /// Guarda con un pequeño retardo para no escribir en cada pulsación.
    func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            self?.saveNow()
        }
    }

    func saveNow() {
        let snapshot = Snapshot(events: events, tasks: tasks, routines: routines, settings: settings)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        do {
            let data = try encoder.encode(snapshot)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("No pude guardar: \(error)")
        }
    }

    /// Llamar tras cualquier cambio: persiste y reprograma las notificaciones.
    func didChange() {
        scheduleSave()
        NotificationService.shared.reschedule(from: self)
    }

    // MARK: Altas y bajas

    func upsert(_ event: Event) {
        if let i = events.firstIndex(where: { $0.id == event.id }) { events[i] = event } else { events.append(event) }
        didChange()
    }

    func upsert(_ task: TaskItem) {
        if let i = tasks.firstIndex(where: { $0.id == task.id }) { tasks[i] = task } else { tasks.append(task) }
        didChange()
    }

    func upsert(_ routine: Routine) {
        if let i = routines.firstIndex(where: { $0.id == routine.id }) { routines[i] = routine } else { routines.append(routine) }
        didChange()
    }

    func deleteEvent(_ id: UUID) { events.removeAll { $0.id == id }; didChange() }
    func deleteTask(_ id: UUID) { tasks.removeAll { $0.id == id }; didChange() }
    func deleteRoutine(_ id: UUID) { routines.removeAll { $0.id == id }; didChange() }

    func toggleTask(_ id: UUID) {
        guard let i = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[i].done.toggle()
        tasks[i].doneAt = tasks[i].done ? Date() : nil
        didChange()
    }

    func toggleRoutine(_ id: UUID, on day: Date) {
        guard let i = routines.firstIndex(where: { $0.id == id }) else { return }
        let key = DateKey.string(from: day)
        if routines[i].completions.contains(key) { routines[i].completions.remove(key) }
        else { routines[i].completions.insert(key) }
        didChange()
    }

    func clearAll() {
        events = []; tasks = []; routines = []
        didChange()
    }

    // MARK: Consultas

    /// Todo lo que toca un día, ordenado por hora.
    func occurrences(on day: Date, calendar: Calendar = .current) -> [Occurrence] {
        let dayStart = calendar.startOfDay(for: day)
        let dayEnd = dayStart.adding(days: 1)
        let key = DateKey.string(from: day)
        let now = Date()
        var result: [Occurrence] = []

        for event in events {
            let last = event.end ?? event.start
            guard last >= dayStart, event.start < dayEnd else { continue }
            result.append(Occurrence(
                id: "event-\(event.id)-\(key)", kind: .event, title: event.title, notes: event.notes,
                start: event.allDay ? nil : event.start, end: event.end, allDay: event.allDay,
                done: false, overdue: false, alarms: event.alarms, color: event.color,
                ruleDescription: nil, sourceID: event.id, dayKey: key))
        }

        for task in tasks {
            guard let due = task.due, calendar.isDate(due, inSameDayAs: day) else { continue }
            result.append(Occurrence(
                id: "task-\(task.id)-\(key)", kind: .task, title: task.title, notes: task.notes,
                start: task.allDay ? nil : due, end: nil, allDay: task.allDay,
                done: task.done, overdue: !task.done && due < now, alarms: task.alarms, color: task.color,
                ruleDescription: nil, sourceID: task.id, dayKey: key))
        }

        for routine in routines where routine.occurs(on: day, calendar: calendar) {
            let start = routine.timeOfDay.flatMap { comps in
                dayStart.at(hour: comps.hour ?? 0, minute: comps.minute ?? 0, calendar)
            }
            let done = routine.isDone(on: day)
            result.append(Occurrence(
                id: "routine-\(routine.id)-\(key)", kind: .routine, title: routine.title, notes: routine.notes,
                start: start, end: nil, allDay: start == nil,
                done: done, overdue: !done && (start.map { $0 < now } ?? false),
                alarms: routine.alarms, color: routine.color,
                ruleDescription: routine.rule.describedInSpanish, sourceID: routine.id, dayKey: key))
        }

        return result.sorted { a, b in
            switch (a.start, b.start) {
            case let (x?, y?): return x < y
            case (nil, _?): return true
            case (_?, nil): return false
            default: return a.title.localizedCompare(b.title) == .orderedAscending
            }
        }
    }

    /// Tareas con fecha vencida y sin hacer.
    func overdueTasks(now: Date = Date(), calendar: Calendar = .current) -> [TaskItem] {
        let today = calendar.startOfDay(for: now)
        return tasks
            .filter { !$0.done && ($0.due.map { $0 < today } ?? false) }
            .sorted { ($0.due ?? .distantPast) < ($1.due ?? .distantPast) }
    }

    /// Tareas sin fecha y sin hacer.
    var inboxTasks: [TaskItem] {
        tasks.filter { !$0.done && $0.due == nil }
    }
}
