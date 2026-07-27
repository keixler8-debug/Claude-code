import SwiftUI

/// Qué se está editando (o creando).
enum EditorTarget: Identifiable {
    case new(OccurrenceKind, Date)
    case event(Event)
    case task(TaskItem)
    case routine(Routine)

    var id: String {
        switch self {
        case .new(let kind, let date): return "new-\(kind.rawValue)-\(DateKey.string(from: date))"
        case .event(let e): return "event-\(e.id)"
        case .task(let t): return "task-\(t.id)"
        case .routine(let r): return "routine-\(r.id)"
        }
    }
}

struct EditorView: View {
    @EnvironmentObject private var store: Store
    @Environment(\.dismiss) private var dismiss

    let target: EditorTarget

    @State private var kind: OccurrenceKind = .event
    @State private var isNew = true

    // Comunes
    @State private var title = ""
    @State private var notes = ""
    @State private var alarms: Set<Int> = []
    @State private var color: ItemColor = .blue

    // Evento
    @State private var eventID = UUID()
    @State private var start = Date()
    @State private var hasEnd = false
    @State private var end = Date()
    @State private var allDay = false

    // Tarea
    @State private var taskID = UUID()
    @State private var hasDue = true
    @State private var due = Date()
    @State private var done = false

    // Rutina
    @State private var routineID = UUID()
    @State private var freq: Frequency = .daily
    @State private var interval = 1
    @State private var weekdays: Set<Int> = []
    @State private var monthDaysText = ""
    @State private var hasTime = true
    @State private var timeOfDay = Date()
    @State private var routineStart = Date()
    @State private var hasRoutineEnd = false
    @State private var routineEnd = Date()
    @State private var completions: Set<String> = []

    @State private var showDeleteConfirm = false

    var body: some View {
        NavigationStack {
            Form {
                if isNew {
                    Section {
                        Picker("Tipo", selection: $kind) {
                            Text("Evento").tag(OccurrenceKind.event)
                            Text("Tarea").tag(OccurrenceKind.task)
                            Text("Rutina").tag(OccurrenceKind.routine)
                        }
                        .pickerStyle(.segmented)
                    }
                }

                Section {
                    TextField(kind == .routine ? "Ej. Tomar la medicación" : "Ej. Dentista", text: $title)
                        .font(.headline)
                }

                switch kind {
                case .event: eventSection
                case .task: taskSection
                case .routine: routineSection
                }

                Section("Alarmas") {
                    alarmPicker
                } footer: {
                    Text("Cada alarma se convierte en una notificación del sistema: suena aunque el iPhone esté bloqueado.")
                }

                Section("Color") {
                    colorPicker
                }

                Section("Notas") {
                    TextField("Opcional", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                }

                if !isNew {
                    Section {
                        Button("Eliminar", role: .destructive) { showDeleteConfirm = true }
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .navigationTitle(isNew ? "Nuevo" : "Editar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isNew ? "Añadir" : "Guardar", action: commit)
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("¿Eliminar «\(title)»?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Eliminar", role: .destructive) { deleteItem(); dismiss() }
                Button("Cancelar", role: .cancel) {}
            }
            .onAppear(perform: loadTarget)
        }
    }

    // MARK: Secciones

    private var eventSection: some View {
        Section("Cuándo") {
            Toggle("Todo el día", isOn: $allDay)
            DatePicker("Empieza", selection: $start,
                       displayedComponents: allDay ? [.date] : [.date, .hourAndMinute])
            Toggle("Tiene hora de fin", isOn: $hasEnd)
            if hasEnd {
                DatePicker("Termina", selection: $end,
                           displayedComponents: allDay ? [.date] : [.date, .hourAndMinute])
            }
        }
    }

    private var taskSection: some View {
        Section("Cuándo") {
            Toggle("Con fecha", isOn: $hasDue)
            if hasDue {
                Toggle("Todo el día", isOn: $allDay)
                DatePicker("Fecha límite", selection: $due,
                           displayedComponents: allDay ? [.date] : [.date, .hourAndMinute])
            } else {
                Text("Sin fecha se queda en la bandeja de entrada.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Toggle("Ya está hecha", isOn: $done)
        }
    }

    @ViewBuilder
    private var routineSection: some View {
        Section("Se repite") {
            Picker("Frecuencia", selection: $freq) {
                ForEach(Frequency.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)

            if freq == .weekly {
                weekdayPicker
            }

            if freq == .monthly {
                TextField("Días del mes (ej. 1, 15)", text: $monthDaysText)
                    .keyboardType(.numbersAndPunctuation)
            }

            Stepper(intervalLabel, value: $interval, in: 1...99)
        }

        Section("Hora") {
            Toggle("A una hora concreta", isOn: $hasTime)
            if hasTime {
                DatePicker("Hora", selection: $timeOfDay, displayedComponents: .hourAndMinute)
            } else {
                Text("Sin hora aparece como pendiente del día (y no puede sonar).")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }

        Section("Vigencia") {
            DatePicker("Desde", selection: $routineStart, displayedComponents: .date)
            Toggle("Tiene fecha de fin", isOn: $hasRoutineEnd)
            if hasRoutineEnd {
                DatePicker("Hasta", selection: $routineEnd, displayedComponents: .date)
            }
        }
    }

    private var intervalLabel: String {
        let unit = freq == .daily ? "días" : (freq == .weekly ? "semanas" : "meses")
        return interval == 1 ? "Cada \(unit.dropLast())" : "Cada \(interval) \(unit)"
    }

    private var weekdayPicker: some View {
        HStack(spacing: 6) {
            // Se muestra empezando en lunes (weekday 2) y terminando en domingo (1).
            ForEach([2, 3, 4, 5, 6, 7, 1], id: \.self) { weekday in
                let active = weekdays.contains(weekday)
                Button {
                    if active { weekdays.remove(weekday) } else { weekdays.insert(weekday) }
                } label: {
                    Text(weekdayInitials[weekday - 1])
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 34)
                        .background(active ? Color.accentColor : Color(.tertiarySystemFill),
                                    in: RoundedRectangle(cornerRadius: 8))
                        .foregroundStyle(active ? .white : .primary)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var alarmPicker: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 78), spacing: 8)], spacing: 8) {
            ForEach(alarmPresets, id: \.minutes) { preset in
                let active = alarms.contains(preset.minutes)
                Button {
                    if active { alarms.remove(preset.minutes) } else { alarms.insert(preset.minutes) }
                } label: {
                    Text(preset.label)
                        .font(.footnote.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(active ? Color.accentColor : Color(.tertiarySystemFill), in: Capsule())
                        .foregroundStyle(active ? .white : .primary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 2)
    }

    private var colorPicker: some View {
        HStack(spacing: 12) {
            ForEach(ItemColor.allCases) { option in
                Button {
                    color = option
                } label: {
                    Circle()
                        .fill(option.swiftUIColor)
                        .frame(width: 30, height: 30)
                        .overlay(Circle().strokeBorder(.primary, lineWidth: color == option ? 3 : 0))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(option.label)
            }
        }
    }

    // MARK: Cargar y guardar

    private func loadTarget() {
        switch target {
        case .new(let newKind, let date):
            isNew = true
            kind = newKind
            alarms = Set(store.settings.defaultAlarms)
            let hour = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
            let rounded = Calendar.current.date(bySetting: .minute, value: 0, of: hour) ?? hour
            let base = Calendar.current.startOfDay(for: date)
                .at(hour: Calendar.current.component(.hour, from: rounded), minute: 0)
            start = base
            end = base.addingTimeInterval(3600)
            due = base
            routineStart = Calendar.current.startOfDay(for: date)
            routineEnd = routineStart.adding(days: 30)
            timeOfDay = Calendar.current.startOfDay(for: date).at(hour: 9, minute: 0)
            weekdays = [Calendar.current.component(.weekday, from: date)]
            monthDaysText = String(Calendar.current.component(.day, from: date))
            color = newKind == .task ? .green : (newKind == .routine ? .violet : .blue)

        case .event(let e):
            isNew = false; kind = .event; eventID = e.id
            title = e.title; notes = e.notes; alarms = Set(e.alarms); color = e.color
            start = e.start; hasEnd = e.end != nil; end = e.end ?? e.start.addingTimeInterval(3600)
            allDay = e.allDay

        case .task(let t):
            isNew = false; kind = .task; taskID = t.id
            title = t.title; notes = t.notes; alarms = Set(t.alarms); color = t.color
            hasDue = t.due != nil; due = t.due ?? Date(); allDay = t.allDay; done = t.done

        case .routine(let r):
            isNew = false; kind = .routine; routineID = r.id
            title = r.title; notes = r.notes; alarms = Set(r.alarms); color = r.color
            freq = r.rule.freq; interval = r.rule.interval
            weekdays = Set(r.rule.byWeekday)
            monthDaysText = r.rule.byMonthDay.map(String.init).joined(separator: ", ")
            hasTime = r.timeOfDay != nil
            timeOfDay = Date().startOfDay().at(hour: r.timeHour ?? 9, minute: r.timeMinute ?? 0)
            routineStart = r.startDate
            hasRoutineEnd = r.endDate != nil
            routineEnd = r.endDate ?? r.startDate.adding(days: 30)
            completions = r.completions
        }
    }

    private func commit() {
        let cleanTitle = title.trimmingCharacters(in: .whitespaces)
        guard !cleanTitle.isEmpty else { return }
        let sortedAlarms = alarms.sorted()

        switch kind {
        case .event:
            var e = Event(id: eventID)
            e.title = cleanTitle; e.notes = notes; e.start = start
            e.end = hasEnd ? max(end, start) : nil
            e.allDay = allDay; e.alarms = sortedAlarms; e.color = color
            store.upsert(e)

        case .task:
            var t = TaskItem(id: taskID)
            t.title = cleanTitle; t.notes = notes
            t.due = hasDue ? due : nil
            t.allDay = hasDue && allDay
            t.alarms = sortedAlarms; t.color = color
            t.done = done; t.doneAt = done ? Date() : nil
            store.upsert(t)

        case .routine:
            var r = Routine(id: routineID)
            r.title = cleanTitle; r.notes = notes
            var rule = RecurrenceRule()
            rule.freq = freq
            rule.interval = max(1, interval)
            rule.byWeekday = freq == .weekly ? weekdays.sorted() : []
            rule.byMonthDay = freq == .monthly ? parsedMonthDays : []
            // Sin días marcados una regla semanal no se dispararía nunca.
            if freq == .weekly && rule.byWeekday.isEmpty {
                rule.byWeekday = [Calendar.current.component(.weekday, from: routineStart)]
            }
            if freq == .monthly && rule.byMonthDay.isEmpty {
                rule.byMonthDay = [Calendar.current.component(.day, from: routineStart)]
            }
            r.rule = rule
            if hasTime {
                let comps = Calendar.current.dateComponents([.hour, .minute], from: timeOfDay)
                r.timeHour = comps.hour
                r.timeMinute = comps.minute
            }
            r.startDate = routineStart.startOfDay()
            r.endDate = hasRoutineEnd ? routineEnd.startOfDay() : nil
            r.alarms = hasTime ? sortedAlarms : []
            r.color = color
            r.completions = completions
            store.upsert(r)
        }
        dismiss()
    }

    private var parsedMonthDays: [Int] {
        let numbers = monthDaysText
            .components(separatedBy: CharacterSet(charactersIn: ", "))
            .compactMap(Int.init)
            .filter { (1...31).contains($0) }
        return Array(Set(numbers)).sorted()
    }

    private func deleteItem() {
        switch kind {
        case .event: store.deleteEvent(eventID)
        case .task: store.deleteTask(taskID)
        case .routine: store.deleteRoutine(routineID)
        }
    }
}
