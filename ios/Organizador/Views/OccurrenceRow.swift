import SwiftUI

/// Fila reutilizada por todas las listas.
struct OccurrenceRow: View {
    let occurrence: Occurrence
    var showDate: Bool = false
    let onToggle: () -> Void
    let onEdit: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if occurrence.kind == .event {
                Circle()
                    .fill(occurrence.color.swiftUIColor)
                    .frame(width: 10, height: 10)
                    .padding(.top, 7)
                    .padding(.horizontal, 7)
            } else {
                Button(action: onToggle) {
                    Image(systemName: occurrence.done ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 23))
                        .foregroundStyle(occurrence.done ? Color.green : Color.secondary.opacity(0.55))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(occurrence.done ? "Marcar como pendiente" : "Marcar como hecho")
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(occurrence.title)
                    .font(.system(size: 16, weight: .medium))
                    .strikethrough(occurrence.done)
                    .foregroundStyle(occurrence.done ? .secondary : .primary)

                HStack(spacing: 8) {
                    if showDate, let start = occurrence.start {
                        chip(Format.dayShort.string(from: start), icon: "calendar")
                    }
                    if let rule = occurrence.ruleDescription {
                        chip(rule, icon: "arrow.triangle.2.circlepath")
                    }
                    if occurrence.overdue {
                        Text("atrasado")
                            .font(.caption).bold()
                            .foregroundStyle(.red)
                    }
                    ForEach(occurrence.alarms, id: \.self) { minutes in
                        chip(Format.alarmLabel(minutes), icon: "bell.fill", tint: .orange)
                    }
                }
                .lineLimit(1)

                if !occurrence.notes.isEmpty {
                    Text(occurrence.notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 4)

            Text(occurrence.allDay || occurrence.start == nil
                 ? "todo el día"
                 : Format.time.string(from: occurrence.start!))
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
        .listRowBackground(
            HStack(spacing: 0) {
                Rectangle().fill(occurrence.color.swiftUIColor).frame(width: 3)
                Color(.secondarySystemGroupedBackground)
            }
        )
    }

    private func chip(_ text: String, icon: String, tint: Color = .secondary) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon).font(.system(size: 9))
            Text(text)
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(tint)
        .padding(.horizontal, 7)
        .padding(.vertical, 2)
        .background(tint.opacity(0.14), in: Capsule())
    }
}
