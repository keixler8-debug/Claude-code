import Foundation
import UserNotifications

/// Alarmas de verdad: notificaciones locales del sistema. Suenan con el iPhone
/// bloqueado y sin necesidad de servidor, que es justo lo que una web no puede hacer.
final class NotificationService: NSObject {
    static let shared = NotificationService()

    /// iOS solo mantiene 64 notificaciones pendientes por app; dejamos margen.
    private let budget = 60
    /// Hasta dónde miramos hacia adelante al programar avisos con fecha fija.
    private let horizonDays = 120

    private let center = UNUserNotificationCenter.current()

    // MARK: Permiso

    func requestAuthorization() async -> Bool {
        do {
            return try await center.requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            print("Permiso de notificaciones denegado: \(error)")
            return false
        }
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        await center.notificationSettings().authorizationStatus
    }

    func pendingCount() async -> Int {
        await center.pendingNotificationRequests().count
    }

    // MARK: Programación

    /// Borra lo pendiente y vuelve a programar desde el estado actual.
    @MainActor
    func reschedule(from store: Store) {
        let requests = buildRequests(store: store)
        center.removeAllPendingNotificationRequests()
        for request in requests {
            center.add(request) { error in
                if let error { print("No pude programar \(request.identifier): \(error)") }
            }
        }
    }

    @MainActor
    private func buildRequests(store: Store, now: Date = Date(), calendar: Calendar = .current) -> [UNNotificationRequest] {
        var repeating: [UNNotificationRequest] = []
        var oneShot: [(date: Date, request: UNNotificationRequest)] = []

        // --- Rutinas: si se repiten de forma regular, un disparador repetitivo basta ---
        for routine in store.routines {
            guard let time = routine.timeOfDay, let hour = time.hour, let minute = time.minute else { continue }
            guard !routine.alarms.isEmpty else { continue }
            if routine.endDate != nil || routine.rule.interval > 1 {
                // Con fecha de fin o intervalos irregulares hay que enumerar día a día.
                oneShot.append(contentsOf: enumerateRoutine(routine, from: now, calendar: calendar))
                continue
            }

            for minutesBefore in routine.alarms {
                let fireComponents = shift(hour: hour, minute: minute, byMinutes: -minutesBefore)
                switch routine.rule.freq {
                case .daily:
                    var comps = DateComponents()
                    comps.hour = fireComponents.hour
                    comps.minute = fireComponents.minute
                    repeating.append(request(
                        id: "routine-\(routine.id)-d-\(minutesBefore)",
                        title: routine.title,
                        body: body(for: routine.notes, minutesBefore: minutesBefore, hour: hour, minute: minute),
                        trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: true)))

                case .weekly:
                    let weekdays = routine.rule.byWeekday.isEmpty ? [calendar.component(.weekday, from: now)] : routine.rule.byWeekday
                    for weekday in weekdays {
                        var comps = DateComponents()
                        // Si el aviso se adelanta al día anterior, corrige el día de la semana.
                        comps.weekday = ((weekday - 1 + fireComponents.dayShift) % 7 + 7) % 7 + 1
                        comps.hour = fireComponents.hour
                        comps.minute = fireComponents.minute
                        repeating.append(request(
                            id: "routine-\(routine.id)-w\(weekday)-\(minutesBefore)",
                            title: routine.title,
                            body: body(for: routine.notes, minutesBefore: minutesBefore, hour: hour, minute: minute),
                            trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: true)))
                    }

                case .monthly:
                    // Un aviso que cruza al día anterior no se puede expresar con "día del mes":
                    // esos se enumeran uno a uno.
                    guard fireComponents.dayShift == 0 else {
                        oneShot.append(contentsOf: enumerateRoutine(routine, from: now, calendar: calendar))
                        continue
                    }
                    let days = routine.rule.byMonthDay.isEmpty ? [calendar.component(.day, from: routine.startDate)] : routine.rule.byMonthDay
                    for day in days {
                        var comps = DateComponents()
                        comps.day = day
                        comps.hour = fireComponents.hour
                        comps.minute = fireComponents.minute
                        repeating.append(request(
                            id: "routine-\(routine.id)-m\(day)-\(minutesBefore)",
                            title: routine.title,
                            body: body(for: routine.notes, minutesBefore: minutesBefore, hour: hour, minute: minute),
                            trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: true)))
                    }
                }
            }
        }

        // --- Eventos ---
        for event in store.events where !event.allDay {
            for minutesBefore in event.alarms {
                let fireDate = event.start.addingTimeInterval(-Double(minutesBefore) * 60)
                guard fireDate > now, fireDate < now.adding(days: horizonDays) else { continue }
                oneShot.append((fireDate, request(
                    id: "event-\(event.id)-\(minutesBefore)",
                    title: event.title,
                    body: bodyFor(date: event.start, minutesBefore: minutesBefore, notes: event.notes),
                    trigger: trigger(at: fireDate, calendar: calendar))))
            }
        }

        // --- Tareas puntuales ---
        for task in store.tasks where !task.done && !task.allDay {
            guard let due = task.due else { continue }
            for minutesBefore in task.alarms {
                let fireDate = due.addingTimeInterval(-Double(minutesBefore) * 60)
                guard fireDate > now, fireDate < now.adding(days: horizonDays) else { continue }
                oneShot.append((fireDate, request(
                    id: "task-\(task.id)-\(minutesBefore)",
                    title: task.title,
                    body: bodyFor(date: due, minutesBefore: minutesBefore, notes: task.notes),
                    trigger: trigger(at: fireDate, calendar: calendar))))
            }
        }

        // Las repetitivas van primero (cubren el futuro indefinido); el resto,
        // las más cercanas hasta agotar el presupuesto de iOS.
        let remaining = max(0, budget - repeating.count)
        let nearest = oneShot.sorted { $0.date < $1.date }.prefix(remaining).map(\.request)
        return repeating + nearest
    }

    /// Enumera las próximas ocurrencias de una rutina que no se puede expresar con un disparador repetitivo.
    @MainActor
    private func enumerateRoutine(_ routine: Routine, from now: Date, calendar: Calendar, limit: Int = 12) -> [(date: Date, request: UNNotificationRequest)] {
        guard let time = routine.timeOfDay, let hour = time.hour, let minute = time.minute else { return [] }
        var out: [(date: Date, request: UNNotificationRequest)] = []
        var day = calendar.startOfDay(for: now)
        var checked = 0

        while out.count < limit && checked < horizonDays {
            checked += 1
            defer { day = day.adding(days: 1, calendar) }
            guard routine.occurs(on: day, calendar: calendar) else { continue }
            let at = day.at(hour: hour, minute: minute, calendar)
            for minutesBefore in routine.alarms {
                let fireDate = at.addingTimeInterval(-Double(minutesBefore) * 60)
                guard fireDate > now else { continue }
                out.append((fireDate, request(
                    id: "routine-\(routine.id)-\(DateKey.string(from: day))-\(minutesBefore)",
                    title: routine.title,
                    body: bodyFor(date: at, minutesBefore: minutesBefore, notes: routine.notes),
                    trigger: trigger(at: fireDate, calendar: calendar))))
            }
        }
        return out
    }

    // MARK: Piezas sueltas

    private func request(id: String, title: String, body: String, trigger: UNNotificationTrigger) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        if #available(iOS 15.0, *) {
            // Con el permiso "Time Sensitive" concedido, atraviesa los modos de concentración.
            content.interruptionLevel = .timeSensitive
        }
        return UNNotificationRequest(identifier: id, content: content, trigger: trigger)
    }

    private func trigger(at date: Date, calendar: Calendar) -> UNCalendarNotificationTrigger {
        let comps = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        return UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
    }

    /// Resta minutos a una hora del día, avisando de si se cruza al día anterior.
    private func shift(hour: Int, minute: Int, byMinutes delta: Int) -> (hour: Int, minute: Int, dayShift: Int) {
        var total = hour * 60 + minute + delta
        var dayShift = 0
        while total < 0 { total += 1440; dayShift -= 1 }
        while total >= 1440 { total -= 1440; dayShift += 1 }
        return (total / 60, total % 60, dayShift)
    }

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "HH:mm"
        return f
    }()

    private func antelacion(_ minutesBefore: Int) -> String {
        switch minutesBefore {
        case 0: return "Es la hora"
        case ..<60: return "Faltan \(minutesBefore) min"
        case ..<1440:
            let h = minutesBefore / 60
            return h == 1 ? "Falta 1 hora" : "Faltan \(h) horas"
        default:
            let d = minutesBefore / 1440
            return d == 1 ? "Falta 1 día" : "Faltan \(d) días"
        }
    }

    private func bodyFor(date: Date, minutesBefore: Int, notes: String) -> String {
        var text = "\(antelacion(minutesBefore)) · \(Self.timeFormatter.string(from: date))"
        if !notes.isEmpty { text += "\n" + notes }
        return text
    }

    private func body(for notes: String, minutesBefore: Int, hour: Int, minute: Int) -> String {
        var text = String(format: "%@ · %02d:%02d", antelacion(minutesBefore), hour, minute)
        if !notes.isEmpty { text += "\n" + notes }
        return text
    }
}

// MARK: - Mostrar el aviso también con la app abierta

extension NotificationService: UNUserNotificationCenterDelegate {
    func configureAsDelegate() {
        center.delegate = self
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }
}
