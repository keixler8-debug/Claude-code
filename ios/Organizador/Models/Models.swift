import Foundation

// MARK: - Repetición

enum Frequency: String, Codable, CaseIterable, Identifiable {
    case daily, weekly, monthly

    var id: String { rawValue }

    var label: String {
        switch self {
        case .daily: return "Diaria"
        case .weekly: return "Semanal"
        case .monthly: return "Mensual"
        }
    }
}

struct RecurrenceRule: Codable, Hashable {
    var freq: Frequency = .daily
    var interval: Int = 1
    /// 1 = domingo … 7 = sábado (igual que `Calendar.component(.weekday:)`).
    var byWeekday: [Int] = []
    var byMonthDay: [Int] = []

    var describedInSpanish: String {
        let n = max(1, interval)
        switch freq {
        case .daily:
            return n == 1 ? "Todos los días" : "Cada \(n) días"
        case .weekly:
            let names = byWeekday.sorted().map { Self.weekdayNames[$0 - 1] }
            let which: String
            if byWeekday.sorted() == [2, 3, 4, 5, 6] { which = "de lunes a viernes" }
            else if byWeekday.sorted() == [1, 7] { which = "los fines de semana" }
            else if names.isEmpty { which = "" }
            else { which = "los " + names.joined(separator: ", ") }
            return (n == 1 ? "Cada semana \(which)" : "Cada \(n) semanas \(which)")
                .trimmingCharacters(in: .whitespaces)
        case .monthly:
            let days = byMonthDay.sorted().map(String.init).joined(separator: ", ")
            let which = days.isEmpty ? "" : "el día \(days)"
            return (n == 1 ? "Cada mes \(which)" : "Cada \(n) meses \(which)")
                .trimmingCharacters(in: .whitespaces)
        }
    }

    static let weekdayNames = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"]
}

// MARK: - Color

enum ItemColor: String, Codable, CaseIterable, Identifiable {
    case blue, violet, green, orange, pink, teal, gray
    var id: String { rawValue }
}

// MARK: - Elementos

/// Cita con hora de inicio (y opcionalmente de fin).
struct Event: Identifiable, Codable, Hashable {
    var id = UUID()
    var title: String = ""
    var notes: String = ""
    var start: Date = Date()
    var end: Date?
    var allDay: Bool = false
    /// Minutos de antelación de cada aviso.
    var alarms: [Int] = [10]
    var color: ItemColor = .blue
    var createdAt: Date = Date()
}

/// Tarea puntual: se hace una vez y se acaba.
struct TaskItem: Identifiable, Codable, Hashable {
    var id = UUID()
    var title: String = ""
    var notes: String = ""
    /// `nil` = sin fecha (queda en la bandeja de entrada).
    var due: Date?
    var allDay: Bool = false
    var alarms: [Int] = [0]
    var done: Bool = false
    var doneAt: Date?
    var color: ItemColor = .green
    var createdAt: Date = Date()
}

/// Tarea que se repite: la medicación, el gimnasio, sacar la basura…
struct Routine: Identifiable, Codable, Hashable {
    var id = UUID()
    var title: String = ""
    var notes: String = ""
    /// Hora del día; `nil` = pendiente sin hora concreta.
    var timeHour: Int?
    var timeMinute: Int?
    var rule = RecurrenceRule()
    var startDate: Date = Calendar.current.startOfDay(for: Date())
    var endDate: Date?
    var alarms: [Int] = [0]
    /// Claves "yyyy-MM-dd" de los días ya completados.
    var completions: Set<String> = []
    var color: ItemColor = .violet
    var createdAt: Date = Date()

    var timeOfDay: DateComponents? {
        guard let h = timeHour, let m = timeMinute else { return nil }
        return DateComponents(hour: h, minute: m)
    }

    /// ¿Toca esta rutina el día indicado?
    func occurs(on day: Date, calendar: Calendar = .current) -> Bool {
        let day = calendar.startOfDay(for: day)
        if day < calendar.startOfDay(for: startDate) { return false }
        if let endDate, day > calendar.startOfDay(for: endDate) { return false }

        let interval = max(1, rule.interval)
        let from = calendar.startOfDay(for: startDate)

        switch rule.freq {
        case .daily:
            guard interval > 1 else { return true }
            let days = calendar.dateComponents([.day], from: from, to: day).day ?? 0
            return days % interval == 0

        case .weekly:
            let weekday = calendar.component(.weekday, from: day)
            let days = rule.byWeekday.isEmpty ? [weekday] : rule.byWeekday
            guard days.contains(weekday) else { return false }
            guard interval > 1 else { return true }
            let elapsed = calendar.dateComponents([.day], from: from, to: day).day ?? 0
            return (elapsed / 7) % interval == 0

        case .monthly:
            let dayOfMonth = calendar.component(.day, from: day)
            let lastOfMonth = calendar.range(of: .day, in: .month, for: day)?.count ?? 31
            let wanted = rule.byMonthDay.isEmpty ? [calendar.component(.day, from: from)] : rule.byMonthDay
            // "El 31" en un mes corto se resuelve el último día.
            let matches = wanted.contains { $0 == dayOfMonth || ($0 > lastOfMonth && dayOfMonth == lastOfMonth) }
            guard matches else { return false }
            guard interval > 1 else { return true }
            let months = calendar.dateComponents([.month], from: from, to: day).month ?? 0
            return months % interval == 0
        }
    }

    func isDone(on day: Date) -> Bool {
        completions.contains(DateKey.string(from: day))
    }
}

// MARK: - Ocurrencia (lo que se pinta en una lista de un día)

enum OccurrenceKind: String {
    case event, task, routine
}

struct Occurrence: Identifiable {
    let id: String
    let kind: OccurrenceKind
    let title: String
    let notes: String
    /// `nil` cuando es de día completo o no tiene hora.
    let start: Date?
    let end: Date?
    let allDay: Bool
    let done: Bool
    let overdue: Bool
    let alarms: [Int]
    let color: ItemColor
    let ruleDescription: String?
    /// Identificador del elemento de origen, para poder editarlo o marcarlo.
    let sourceID: UUID
    let dayKey: String
}

// MARK: - Utilidades de fecha

enum DateKey {
    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func string(from date: Date) -> String { formatter.string(from: date) }
    static func date(from string: String) -> Date? { formatter.date(from: string) }
}

extension Date {
    func startOfDay(_ calendar: Calendar = .current) -> Date { calendar.startOfDay(for: self) }

    func adding(days: Int, _ calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .day, value: days, to: self) ?? self
    }

    func adding(months: Int, _ calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .month, value: months, to: self) ?? self
    }

    func isSameDay(as other: Date, _ calendar: Calendar = .current) -> Bool {
        calendar.isDate(self, inSameDayAs: other)
    }

    /// Combina el día de `self` con una hora concreta.
    func at(hour: Int, minute: Int, _ calendar: Calendar = .current) -> Date {
        calendar.date(bySettingHour: hour, minute: minute, second: 0, of: self) ?? self
    }
}
