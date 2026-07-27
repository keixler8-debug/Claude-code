import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var store: Store
    @Binding var editing: EditorTarget?
    /// Cambia a medianoche para que la vista se refresque sola.
    let today: Date

    private var occurrences: [Occurrence] { store.occurrences(on: today) }
    private var pending: [Occurrence] { occurrences.filter { !$0.done } }
    private var next: Occurrence? {
        occurrences.first { !$0.done && ($0.start.map { $0 > Date() } ?? false) }
    }

    var body: some View {
        List {
            Section {
                hero
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }

            let overdue = store.overdueTasks()
            if !overdue.isEmpty {
                Section("Atrasado") {
                    ForEach(overdue) { task in
                        ItemRow(editing: $editing, occurrence: task.asOccurrence, showDate: true)
                    }
                }
            }

            Section("Hoy") {
                if occurrences.isEmpty {
                    EmptyRow(title: "Día despejado", hint: "Toca + para añadir algo.")
                } else {
                    ForEach(occurrences) { ItemRow(editing: $editing, occurrence: $0) }
                }
            }

            let inbox = store.inboxTasks
            if !inbox.isEmpty {
                Section("Sin fecha") {
                    ForEach(inbox) { ItemRow(editing: $editing, occurrence: $0.asOccurrence) }
                }
            }

            let tomorrow = store.occurrences(on: today.adding(days: 1)).filter { !$0.done }
            if !tomorrow.isEmpty {
                Section("Mañana") {
                    ForEach(tomorrow) { ItemRow(editing: $editing, occurrence: $0) }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Hoy")
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(Format.capitalizedFirst(Format.dayLong.string(from: today)))
                .font(.subheadline)
                .opacity(0.9)
            Text(headline)
                .font(.title.bold())
            Text(summary)
                .font(.subheadline)
                .opacity(0.9)

            if let next, let start = next.start {
                Divider().overlay(Color.white.opacity(0.35)).padding(.vertical, 8)
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("A CONTINUACIÓN").font(.caption2).opacity(0.85)
                        Text(next.title).font(.subheadline.weight(.semibold))
                    }
                    Spacer()
                    Text(Format.time.string(from: start)).font(.subheadline.weight(.semibold))
                }
            }
        }
        .foregroundStyle(.white)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [ItemColor.blue.swiftUIColor, ItemColor.violet.swiftUIColor],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    private var headline: String {
        switch pending.count {
        case 0: return "Todo listo"
        case 1: return "Queda 1 cosa"
        default: return "Quedan \(pending.count) cosas"
        }
    }

    private var summary: String {
        guard !occurrences.isEmpty else { return "Nada en la agenda de hoy." }
        let done = occurrences.count - pending.count
        return "\(pending.count) pendiente\(pending.count == 1 ? "" : "s") · \(done) hecho\(done == 1 ? "" : "s")"
    }
}
