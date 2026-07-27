import SwiftUI

struct CalendarView: View {
    @EnvironmentObject private var store: Store
    @Binding var editing: EditorTarget?

    @State private var cursor = Date().startOfDay()
    @State private var selected = Date().startOfDay()

    private var calendar: Calendar {
        var c = Calendar.current
        c.firstWeekday = store.settings.firstWeekday
        return c
    }

    var body: some View {
        List {
            Section {
                VStack(spacing: 10) {
                    header
                    weekdayHeader
                    grid
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
            }

            Section {
                let items = store.occurrences(on: selected)
                if items.isEmpty {
                    EmptyRow(title: "Nada este día", hint: "Toca + para añadir algo.")
                } else {
                    ForEach(items) { ItemRow(editing: $editing, occurrence: $0) }
                }
            } header: {
                HStack {
                    Text(Format.capitalizedFirst(Format.dayLong.string(from: selected)))
                    Spacer()
                    Button("Añadir") { editing = .new(.event, selected) }
                        .font(.footnote.weight(.semibold))
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Calendario")
    }

    private var header: some View {
        HStack {
            Text(Format.capitalizedFirst(Format.monthYear.string(from: cursor)))
                .font(.title3.weight(.semibold))
            Spacer()
            Button { cursor = cursor.adding(months: -1) } label: { Image(systemName: "chevron.left") }
                .accessibilityLabel("Mes anterior")
            Button {
                cursor = Date().startOfDay()
                selected = cursor
            } label: { Image(systemName: "circle") }
                .accessibilityLabel("Hoy")
                .padding(.horizontal, 6)
            Button { cursor = cursor.adding(months: 1) } label: { Image(systemName: "chevron.right") }
                .accessibilityLabel("Mes siguiente")
        }
        .buttonStyle(.bordered)
    }

    private var weekdayHeader: some View {
        HStack(spacing: 2) {
            ForEach(0..<7, id: \.self) { offset in
                let weekday = (store.settings.firstWeekday - 1 + offset) % 7
                Text(weekdayInitials[weekday])
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var grid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: 2) {
            ForEach(monthDays, id: \.self) { day in
                dayCell(day)
            }
        }
    }

    /// Rejilla de 6x7 que cubre el mes de `cursor`.
    private var monthDays: [Date] {
        let comps = calendar.dateComponents([.year, .month], from: cursor)
        guard let first = calendar.date(from: comps) else { return [] }
        let offset = (calendar.component(.weekday, from: first) - calendar.firstWeekday + 7) % 7
        let start = first.adding(days: -offset, calendar)
        return (0..<42).map { start.adding(days: $0, calendar) }
    }

    private func dayCell(_ day: Date) -> some View {
        let items = store.occurrences(on: day)
        let outOfMonth = calendar.component(.month, from: day) != calendar.component(.month, from: cursor)
        let isSelected = day.isSameDay(as: selected, calendar)
        let isToday = day.isSameDay(as: Date(), calendar)
        let colors = Array(Set(items.map(\.color))).prefix(4)

        return Button {
            selected = day.startOfDay(calendar)
            if outOfMonth { cursor = selected }
        } label: {
            VStack(spacing: 3) {
                Text("\(calendar.component(.day, from: day))")
                    .font(.system(size: 15, weight: isToday ? .bold : .regular))
                HStack(spacing: 2) {
                    ForEach(Array(colors), id: \.self) { color in
                        Circle()
                            .fill(isSelected ? Color.white : color.swiftUIColor)
                            .frame(width: 5, height: 5)
                    }
                }
                .frame(height: 6)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background(isSelected ? Color.accentColor : Color(.secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 9))
            .overlay(
                RoundedRectangle(cornerRadius: 9)
                    .strokeBorder(Color.accentColor, lineWidth: isToday && !isSelected ? 2 : 0)
            )
            .foregroundStyle(isSelected ? .white : (outOfMonth ? .secondary : .primary))
            .opacity(outOfMonth && !isSelected ? 0.5 : 1)
        }
        .buttonStyle(.plain)
    }
}
