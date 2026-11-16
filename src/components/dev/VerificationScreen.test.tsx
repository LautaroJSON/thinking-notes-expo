import { fireEvent, render, screen } from "@testing-library/react-native";
import { NotesProvider } from "@/context/notesContext";
import type { INotes } from "@/types";
import type { NotesRepository, StoredNote } from "@/services/notes/repository";
import { VerificationScreen } from "./VerificationScreen";

const repository = (initial: INotes[]): NotesRepository => ({
  loadNotes: jest.fn(async () => initial),
  createNote: jest.fn(async (n: StoredNote) => n),
  saveNote: jest.fn(async (n: StoredNote) => n),
  deleteNote: jest.fn(async () => undefined),
  saveOrder: jest.fn(async () => undefined),
});

describe("VerificationScreen (temporal)", () => {
  it("lista las notas, crea una y la abre para editar", async () => {
    const repo = repository([
      { id: "a", title: "Primera", thinkings: [{ id: "t", type: "text", value: "hola" }] },
    ]);
    await render(
      <NotesProvider repository={repo}>
        <VerificationScreen />
      </NotesProvider>,
    );

    expect(await screen.findByText("Primera")).toBeOnTheScreen();
    expect(screen.getByText("Guardado")).toBeOnTheScreen();

    await fireEvent.press(screen.getByText("Nueva nota"));

    expect(await screen.findByText("Nota activa")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("Nueva Nota :)")).toBeOnTheScreen();
    expect(repo.createNote).toHaveBeenCalledTimes(1);
  });
});
