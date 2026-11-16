// TEMPORAL — se reemplaza en la etapa de interfaz (spec 009+).
// Pantalla mínima para verificar a mano, en Android y en web, la lógica de
// notas sin cuenta de la spec 006: listar, crear, editar y borrar notas y
// thinkings, reordenar notas y ver el estado de guardado.
import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { INotes, Thinking } from "@/types";
import { createTextThinking, isImageThinking, isTextThinking } from "@/types/thinking";
import { formatNoteDate } from "@/components/utils/dates";
import { useNotes } from "@/hooks/useNotes";
import { getDatabase } from "@/services/notes/database";
import { createSqliteNotesRepository } from "@/services/notes/sqliteNotesRepository";
import { newId } from "@/lib/id";

const TEST_NOTES = 200;
const TEST_THINKINGS = 10;

/** Solo desarrollo: crea notas de prueba para medir la carga (SC-005). */
const seedTestNotes = async () => {
  const repository = createSqliteNotesRepository(await getDatabase());
  const now = new Date().toISOString();
  for (let i = 1; i <= TEST_NOTES; i++) {
    await repository.createNote({
      id: newId(),
      title: `Nota de prueba ${i}`,
      thinkings: Array.from({ length: TEST_THINKINGS }, (_, j) =>
        createTextThinking(`Idea ${j + 1} de la nota ${i}`),
      ),
      createdAt: now,
      updatedAt: now,
    });
  }
};

const Button = ({
  label,
  onPress,
  disabled = false,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.button,
      danger && styles.buttonDanger,
      (pressed || disabled) && styles.buttonDimmed,
    ]}
  >
    <Text style={[styles.buttonText, danger && styles.buttonTextDanger]}>
      {label}
    </Text>
  </Pressable>
);

const ThinkingRow = ({
  thinking,
  onChangeText,
  onRemove,
}: {
  thinking: Thinking;
  onChangeText: (value: string) => void;
  onRemove: () => void;
}) => (
  <View style={styles.row}>
    {isTextThinking(thinking) ? (
      <TextInput
        style={[styles.input, styles.flex]}
        value={thinking.value}
        onChangeText={onChangeText}
        multiline
      />
    ) : (
      <Text style={[styles.muted, styles.flex]}>
        {isImageThinking(thinking)
          ? `[Imagen] × ${thinking.value.length}${thinking.text ? ` — ${thinking.text}` : ""}`
          : `[${thinking.type}]`}
      </Text>
    )}
    <Button label="Borrar" onPress={onRemove} danger />
  </View>
);

export const VerificationScreen = () => {
  const {
    notes,
    activeNoteState,
    addNote,
    deleteNote,
    setActiveNote,
    closeActiveNote,
    updateActiveNote,
    removeThinking,
    reorderNotes,
    loadingSaveNote,
    waitingResponse,
    saveError,
    loadError,
    reorderError,
    clearReorderError,
  } = useNotes();
  const [newThinking, setNewThinking] = useState("");
  const [seedStatus, setSeedStatus] = useState<string | null>(null);
  const [mountedAt] = useState(() => Date.now());

  const isLoading = waitingResponse === "gettingNotes";

  // Medición de SC-005: tiempo desde que se monta la pantalla hasta que la
  // lista está cargada (se ve en los logs de Metro o en la consola del navegador).
  useEffect(() => {
    if (__DEV__ && waitingResponse === "none" && notes.length > 0) {
      console.log(
        `[verificación] ${notes.length} notas cargadas en ${Date.now() - mountedAt} ms`,
      );
    }
    // Solo al terminar la carga inicial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingResponse]);

  const addThinking = () => {
    const text = newThinking.trim();
    if (!activeNoteState || !text) return;
    updateActiveNote({
      thinkings: [...activeNoteState.thinkings, createTextThinking(text)],
    });
    setNewThinking("");
  };

  const editThinking = (thinkingId: string, value: string) => {
    if (!activeNoteState) return;
    updateActiveNote({
      thinkings: activeNoteState.thinkings.map((t) =>
        t.id === thinkingId && isTextThinking(t) ? { ...t, value } : t,
      ),
    });
  };

  const seed = async () => {
    setSeedStatus("Creando notas de prueba…");
    try {
      await seedTestNotes();
      setSeedStatus(
        `Listo: ${TEST_NOTES} notas creadas. Cerrá y reabrí la app (o recargá) para medir la carga.`,
      );
    } catch (error) {
      console.error(error);
      setSeedStatus("No se pudieron crear las notas de prueba.");
    }
  };

  const renderNote = (note: INotes, index: number) => {
    const id = note.id;
    if (!id) return null;
    const isActive = activeNoteState?.id === id;
    const date = formatNoteDate(note.updatedAt);
    return (
      <View key={id} style={[styles.card, isActive && styles.cardActive]}>
        <Text style={styles.noteTitle}>{note.title || "(sin título)"}</Text>
        <Text style={styles.muted}>
          {note.thinkings.length} thinkings{date ? ` · ${date}` : ""}
        </Text>
        <View style={styles.row}>
          <Button
            label={isActive ? "Abierta" : "Abrir"}
            onPress={() => setActiveNote(id)}
            disabled={isActive}
          />
          <Button
            label="↑"
            onPress={() => reorderNotes(id, notes[index - 1].id!)}
            disabled={index === 0}
          />
          <Button
            label="↓"
            onPress={() => reorderNotes(id, notes[index + 1].id!)}
            disabled={index === notes.length - 1}
          />
          <Button label="Borrar" onPress={() => deleteNote(id)} danger />
        </View>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.banner}>
        Pantalla temporal de verificación (spec 006)
      </Text>

      <Text style={styles.status}>
        {isLoading
          ? "Cargando notas…"
          : loadingSaveNote
            ? "Pendiente…"
            : "Guardado"}
      </Text>
      {loadError && <Text style={styles.error}>{loadError}</Text>}
      {saveError && <Text style={styles.error}>{saveError}</Text>}
      {reorderError && (
        <View style={styles.row}>
          <Text style={[styles.error, styles.flex]}>{reorderError}</Text>
          <Button label="Descartar" onPress={clearReorderError} />
        </View>
      )}

      <View style={styles.row}>
        <Button label="Nueva nota" onPress={addNote} disabled={isLoading} />
        {__DEV__ && (
          <Button label={`Crear ${TEST_NOTES} notas de prueba`} onPress={seed} />
        )}
      </View>
      {seedStatus && <Text style={styles.muted}>{seedStatus}</Text>}

      <Text style={styles.section}>Notas ({notes.length})</Text>
      {notes.length === 0 && !isLoading && (
        <Text style={styles.muted}>No hay notas.</Text>
      )}
      {notes.map(renderNote)}

      {activeNoteState && (
        <View style={styles.card}>
          <Text style={styles.section}>Nota activa</Text>
          <TextInput
            style={styles.input}
            value={activeNoteState.title}
            onChangeText={(title) => updateActiveNote({ title })}
            placeholder="Título"
          />
          {activeNoteState.thinkings.map((thinking) => (
            <ThinkingRow
              key={thinking.id}
              thinking={thinking}
              onChangeText={(value) => editThinking(thinking.id, value)}
              onRemove={() => removeThinking(thinking.id)}
            />
          ))}
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={newThinking}
              onChangeText={setNewThinking}
              placeholder="Nuevo thinking"
              onSubmitEditing={addThinking}
            />
            <Button label="Agregar" onPress={addThinking} />
          </View>
          <Button label="Cerrar nota" onPress={closeActiveNote} />
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  banner: {
    backgroundColor: "#fff3cd",
    color: "#664d03",
    padding: 8,
    borderRadius: 6,
  },
  status: { fontWeight: "600" },
  error: { color: "#b02a37" },
  section: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  muted: { color: "#6c757d" },
  card: {
    borderWidth: 1,
    borderColor: "#dee2e6",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  cardActive: { borderColor: "#0d6efd", borderWidth: 2 },
  noteTitle: { fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  flex: { flex: 1, minWidth: 120 },
  input: {
    borderWidth: 1,
    borderColor: "#ced4da",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  button: {
    backgroundColor: "#e7f1ff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  buttonDanger: { backgroundColor: "#f8d7da" },
  buttonDimmed: { opacity: 0.5 },
  buttonText: { color: "#0a58ca", fontWeight: "600" },
  buttonTextDanger: { color: "#b02a37" },
});
