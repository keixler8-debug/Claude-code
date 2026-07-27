import Foundation

/// Exporta e importa .ics. Es el formato que comparten la app web y esta,
/// y el que entiende el Calendario de iOS.
enum ICSService {

    // MARK: Exportar

    @MainActor
    static func export(store: Store) -> String {
        var lines: [String] = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Organizador//ES",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:\(escape(store.settings.calendarName))",
            "X-WR-TIMEZONE:\(TimeZone.current.identifier)",
        ]
        let stamp = Date()

        for event in store.events {
            lines += vevent(uid: "\(event.id)@organizador", stamp: stamp, title: event.title, notes: event.notes,
                            start: event.start, end: event.end, allDay: event.allDay,
                            alarms: event.alarms, rrule: nil, category: "Evento")
        }

        for task in store.tasks {
            guard let due = task.due, !task.done else { continue }
            lines += vevent(uid: "\(task.id)@organizador", stamp: stamp, title: task.title, notes: task.notes,
                            start: due, end: nil, allDay: task.allDay,
                            alarms: task.alarms, rrule: nil, category: "Tarea")
        }

        for routine in store.routines {
            guard let rrule = rruleString(routine) else { continue }
            let time = routine.timeOfDay
            let start = routine.startDate.at(hour: time?.hour ?? 9, minute: time?.minute ?? 0)
            lines += vevent(uid: "\(routine.id)@organizador", stamp: stamp, title: routine.title, notes: routine.notes,
                            start: start, end: start.addingTimeInterval(900), allDay: false,
                            alarms: routine.alarms, rrule: rrule, category: "Rutina")
        }

        lines.append("END:VCALENDAR")
        return lines.map(fold).joined(separator: "\r\n") + "\r\n"
    }

    /// Escribe el .ics en un archivo temporal para poder compartirlo.
    @MainActor
    static func writeTemporaryFile(store: Store) throws -> URL {
        let name = store.settings.calendarName
            .replacingOccurrences(of: " ", with: "-")
            .folding(options: .diacriticInsensitive, locale: .current)
            .lowercased()
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(name).ics")
        try export(store: store).data(using: .utf8)?.write(to: url, options: .atomic)
        return url
    }

    private static func vevent(uid: String, stamp: Date, title: String, notes: String,
                               start: Date, end: Date?, allDay: Bool,
                               alarms: [Int], rrule: String?, category: String) -> [String] {
        var lines = ["BEGIN:VEVENT", "UID:\(uid)", "DTSTAMP:\(utc(stamp))"]
        if allDay {
            lines.append("DTSTART;VALUE=DATE:\(dateOnly(start))")
            // En iCalendar el DTEND de un día completo es exclusivo.
            lines.append("DTEND;VALUE=DATE:\(dateOnly((end ?? start).adding(days: 1)))")
        } else {
            lines.append("DTSTART:\(floating(start))")
            lines.append("DTEND:\(floating(end ?? start.addingTimeInterval(1800)))")
        }
        if let rrule { lines.append("RRULE:\(rrule)") }
        lines.append("SUMMARY:\(escape(title))")
        if !notes.isEmpty { lines.append("DESCRIPTION:\(escape(notes))") }
        lines.append("CATEGORIES:\(escape(category))")
        for minutes in alarms {
            lines += [
                "BEGIN:VALARM",
                "ACTION:DISPLAY",
                "TRIGGER:\(minutes == 0 ? "PT0M" : "-PT\(minutes)M")",
                "DESCRIPTION:\(escape(title))",
                "END:VALARM",
            ]
        }
        lines.append("END:VEVENT")
        return lines
    }

    private static let icsWeekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]

    private static func rruleString(_ routine: Routine) -> String? {
        var parts: [String] = []
        let rule = routine.rule
        switch rule.freq {
        case .daily:
            parts.append("FREQ=DAILY")
        case .weekly:
            parts.append("FREQ=WEEKLY")
            if !rule.byWeekday.isEmpty {
                parts.append("BYDAY=" + rule.byWeekday.sorted().map { icsWeekdays[$0 - 1] }.joined(separator: ","))
            }
        case .monthly:
            parts.append("FREQ=MONTHLY")
            if !rule.byMonthDay.isEmpty {
                parts.append("BYMONTHDAY=" + rule.byMonthDay.sorted().map(String.init).joined(separator: ","))
            }
        }
        if rule.interval > 1 { parts.append("INTERVAL=\(rule.interval)") }
        if let end = routine.endDate { parts.append("UNTIL=" + floating(end.at(hour: 23, minute: 59))) }
        return parts.joined(separator: ";")
    }

    // MARK: Importar

    struct Imported {
        var events: [Event] = []
        var routines: [Routine] = []
        var isEmpty: Bool { events.isEmpty && routines.isEmpty }
    }

    static func parse(_ text: String) -> Imported {
        var result = Imported()
        var title = "", notes = ""
        var start: Date?, end: Date?
        var allDay = false
        var rule: RecurrenceRule?
        var alarms: [Int] = []
        var inEvent = false, inAlarm = false
        var trigger: Int?

        for raw in unfold(text).components(separatedBy: .newlines) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }

            if line == "BEGIN:VEVENT" {
                inEvent = true
                title = ""; notes = ""; start = nil; end = nil; allDay = false; rule = nil; alarms = []
                continue
            }
            if line == "END:VEVENT" {
                defer { inEvent = false }
                guard let start, !title.isEmpty else { continue }
                if let rule {
                    var routine = Routine()
                    routine.title = title
                    routine.notes = notes
                    routine.rule = rule
                    routine.startDate = start.startOfDay()
                    if !allDay {
                        let comps = Calendar.current.dateComponents([.hour, .minute], from: start)
                        routine.timeHour = comps.hour
                        routine.timeMinute = comps.minute
                    }
                    routine.alarms = alarms.sorted()
                    result.routines.append(routine)
                } else {
                    var event = Event()
                    event.title = title
                    event.notes = notes
                    event.start = start
                    // El DTEND de un día completo viene con un día de más.
                    event.end = allDay ? end?.adding(days: -1) : end
                    event.allDay = allDay
                    event.alarms = alarms.sorted()
                    result.events.append(event)
                }
                continue
            }
            guard inEvent else { continue }

            if line == "BEGIN:VALARM" { inAlarm = true; trigger = nil; continue }
            if line == "END:VALARM" {
                if let trigger { alarms.append(trigger) }
                inAlarm = false
                continue
            }

            guard let colon = line.firstIndex(of: ":") else { continue }
            let left = String(line[line.startIndex..<colon])
            let value = String(line[line.index(after: colon)...])
            let name = left.components(separatedBy: ";")[0].uppercased()
            let params = left.uppercased()

            if inAlarm {
                if name == "TRIGGER" { trigger = minutes(fromTrigger: value) }
                continue
            }

            switch name {
            case "SUMMARY": title = unescape(value)
            case "DESCRIPTION": notes = unescape(value)
            case "DTSTART":
                let parsed = parseDate(value, isDateOnly: params.contains("VALUE=DATE"))
                start = parsed.date
                allDay = parsed.allDay
            case "DTEND":
                end = parseDate(value, isDateOnly: params.contains("VALUE=DATE")).date
            case "RRULE":
                rule = parseRRule(value)
            default:
                break
            }
        }
        return result
    }

    private static func minutes(fromTrigger value: String) -> Int? {
        // Formas admitidas: -PT30M, -PT1H, -P1D, PT0M
        let pattern = #"^-?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: value, range: NSRange(value.startIndex..., in: value))
        else { return nil }
        func group(_ i: Int) -> Int {
            guard let range = Range(match.range(at: i), in: value) else { return 0 }
            return Int(value[range]) ?? 0
        }
        return group(1) * 1440 + group(2) * 60 + group(3)
    }

    private static func parseRRule(_ value: String) -> RecurrenceRule? {
        var parts: [String: String] = [:]
        for chunk in value.components(separatedBy: ";") {
            let kv = chunk.components(separatedBy: "=")
            if kv.count == 2 { parts[kv[0].uppercased()] = kv[1] }
        }
        var rule = RecurrenceRule()
        rule.interval = Int(parts["INTERVAL"] ?? "1") ?? 1
        switch (parts["FREQ"] ?? "").uppercased() {
        case "DAILY":
            rule.freq = .daily
        case "WEEKLY":
            rule.freq = .weekly
            rule.byWeekday = (parts["BYDAY"] ?? "").components(separatedBy: ",").compactMap {
                let code = $0.trimmingCharacters(in: CharacterSet(charactersIn: "+-0123456789")).uppercased()
                return icsWeekdays.firstIndex(of: code).map { $0 + 1 }
            }
        case "MONTHLY":
            rule.freq = .monthly
            rule.byMonthDay = (parts["BYMONTHDAY"] ?? "").components(separatedBy: ",").compactMap { Int($0) }
        default:
            return nil
        }
        return rule
    }

    private static func parseDate(_ value: String, isDateOnly: Bool) -> (date: Date?, allDay: Bool) {
        var calendar = Calendar(identifier: .gregorian)
        let isUTC = value.hasSuffix("Z")
        calendar.timeZone = isUTC ? TimeZone(identifier: "UTC")! : .current
        let digits = value.filter(\.isNumber)

        if isDateOnly || digits.count == 8 {
            guard digits.count >= 8 else { return (nil, true) }
            let comps = DateComponents(year: Int(digits.prefix(4)),
                                       month: Int(digits.dropFirst(4).prefix(2)),
                                       day: Int(digits.dropFirst(6).prefix(2)))
            return (Calendar.current.date(from: comps), true)
        }
        guard digits.count >= 12 else { return (nil, false) }
        let comps = DateComponents(year: Int(digits.prefix(4)),
                                   month: Int(digits.dropFirst(4).prefix(2)),
                                   day: Int(digits.dropFirst(6).prefix(2)),
                                   hour: Int(digits.dropFirst(8).prefix(2)),
                                   minute: Int(digits.dropFirst(10).prefix(2)))
        return (calendar.date(from: comps), false)
    }

    // MARK: Formato

    private static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: ";", with: "\\;")
            .replacingOccurrences(of: ",", with: "\\,")
            .replacingOccurrences(of: "\n", with: "\\n")
    }

    private static func unescape(_ text: String) -> String {
        text.replacingOccurrences(of: "\\n", with: "\n")
            .replacingOccurrences(of: "\\,", with: ",")
            .replacingOccurrences(of: "\\;", with: ";")
            .replacingOccurrences(of: "\\\\", with: "\\")
    }

    private static func formatter(_ format: String, utc: Bool = false) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = format
        if utc { f.timeZone = TimeZone(identifier: "UTC") }
        return f
    }

    /// Hora local sin zona: iOS la interpreta en la hora del propio teléfono.
    private static func floating(_ date: Date) -> String {
        formatter("yyyyMMdd'T'HHmmss").string(from: date)
    }

    private static func dateOnly(_ date: Date) -> String {
        formatter("yyyyMMdd").string(from: date)
    }

    private static func utc(_ date: Date) -> String {
        formatter("yyyyMMdd'T'HHmmss'Z'", utc: true).string(from: date)
    }

    /// Plegado a 75 octetos que exige el RFC 5545.
    private static func fold(_ line: String) -> String {
        guard line.utf8.count > 75 else { return line }
        var out: [String] = []
        var current = ""
        var size = 0
        for char in line {
            let charSize = String(char).utf8.count
            if size + charSize > (out.isEmpty ? 75 : 74) {
                out.append(current)
                current = ""
                size = 0
            }
            current.append(char)
            size += charSize
        }
        if !current.isEmpty { out.append(current) }
        return out.joined(separator: "\r\n ")
    }

    private static func unfold(_ text: String) -> String {
        text.replacingOccurrences(of: "\r\n ", with: "")
            .replacingOccurrences(of: "\r\n\t", with: "")
            .replacingOccurrences(of: "\n ", with: "")
            .replacingOccurrences(of: "\n\t", with: "")
    }
}
