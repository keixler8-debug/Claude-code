import SwiftUI

extension ItemColor {
    var swiftUIColor: Color {
        switch self {
        case .blue: return Color(red: 0.30, green: 0.43, blue: 0.96)
        case .violet: return Color(red: 0.47, green: 0.31, blue: 0.95)
        case .green: return Color(red: 0.18, green: 0.62, blue: 0.27)
        case .orange: return Color(red: 0.97, green: 0.40, blue: 0.03)
        case .pink: return Color(red: 0.90, green: 0.29, blue: 0.50)
        case .teal: return Color(red: 0.05, green: 0.65, blue: 0.47)
        case .gray: return Color(red: 0.53, green: 0.56, blue: 0.59)
        }
    }

    var label: String {
        switch self {
        case .blue: return "Azul"
        case .violet: return "Violeta"
        case .green: return "Verde"
        case .orange: return "Naranja"
        case .pink: return "Rosa"
        case .teal: return "Turquesa"
        case .gray: return "Gris"
        }
    }
}

enum Format {
    static let time: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "HH:mm"
        return f
    }()

    static let dayLong: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "EEEE, d 'de' MMMM"
        return f
    }()

    static let dayShort: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "d MMM"
        return f
    }()

    static let monthYear: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "LLLL yyyy"
        return f
    }()

    static func capitalizedFirst(_ text: String) -> String {
        guard let first = text.first else { return text }
        return first.uppercased() + text.dropFirst()
    }

    /// "10 min antes", "1 h antes", "a la hora"
    static func alarmLabel(_ minutes: Int) -> String {
        switch minutes {
        case 0: return "a la hora"
        case ..<60: return "\(minutes) min antes"
        case ..<1440: return "\(minutes / 60) h antes"
        default: return "\(minutes / 1440) d antes"
        }
    }
}

/// Opciones de aviso que se ofrecen en el editor.
let alarmPresets: [(minutes: Int, label: String)] = [
    (0, "A la hora"), (5, "5 min"), (10, "10 min"), (15, "15 min"),
    (30, "30 min"), (60, "1 h"), (120, "2 h"), (1440, "1 día"),
]

let weekdayInitials = ["D", "L", "M", "X", "J", "V", "S"] // índice = weekday - 1
