import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import type { INotes } from "@/types";
import { useNotes } from "@/hooks/useNotes";
import type { NotesRepository, StoredNote } from "@/services/notes/repository";
import { NotesProvider } from "./notesContext";

const DELAY = 2000;

const note = (id: string, overrides: Partial<INotes> = {}): StoredNote => ({
  id,
  title: `Nota ${id}`,
  thinkings: [
    { id: `${id}-1`, type: "text", value: "uno" },
    { id: `${id}-2`, type: "text", value: "dos" },
    { id: `${id}-3`, type: "text", value: "tres" },
  ],
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  ...overrides,
});

/** Repositorio falso en memoria: cada método es un jest.fn que resuelve. */
const fakeRepository = (initial: INotes[] = []) => {
  const repo = {
    loadNotes: jest.fn<Promise<INotes[]>, []>(async () => initial),
    createNote: jest.fn<Promise<INotes>, [StoredNote]>(async (n) => n),
    saveNote: jest.fn<Promise<INotes>, [StoredNote]>(async (n) => n),
    deleteNote: jest.fn<Promise<void>, [string]>(async () => undefined),
    saveOrder: jest.fn<Promise<void>, [string[]]>(async () => undefined),
  } satisfies NotesRepository;
  return repo;
};

type FakeRepository = ReturnType<typeof fakeRepository>;

/** Promesa controlada a mano, para observar estados intermedios. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const renderNotes = async (repository: FakeRepository) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NotesProvider repository={repository} autosaveDelayMs={DELAY}>
      {children}
    </NotesProvider>
  );
  const view = await renderHook(() => useNotes(), { wrapper });
  // Deja terminar la carga inicial
  await act(async () => {});
  return view;
};

const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

describe("NotesProvider (sin sesión)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("useNotes fuera del proveedor lanza un error claro", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(renderHook(() => useNotes())).rejects.toThrow(
      "useNotes debe usarse dentro de un NotesProvider",
    );
  });

  it("arranca cargando, pasa a sin sesión y carga las notas", async () => {
    const repo = fakeRepository([note("a"), note("b")]);
    const load = deferred<INotes[]>();
    repo.loadNotes.mockReturnValueOnce(load.promise);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <NotesProvider repository={repo}>{children}</NotesProvider>
    );
    const { result } = await renderHook(() => useNotes(), { wrapper });

    expect(result.current.isLogged).toBe("offline");
    expect(result.current.waitingResponse).toBe("gettingNotes");
    expect(result.current.notes).toEqual([]);

    await act(async () => load.resolve([note("a"), note("b")]));

    expect(result.current.waitingResponse).toBe("none");
    expect(result.current.notes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(result.current.loadError).toBeNull();
  });

  it("addNote crea la nota al final, la activa y la persiste", async () => {
    const repo = fakeRepository([note("a")]);
    const { result } = await renderNotes(repo);

    await act(async () => result.current.addNote());

    const created = result.current.notes[1];
    expect(created).toMatchObject({ title: "Nueva Nota :)", thinkings: [] });
    expect(created.id).toEqual(expect.any(String));
    expect(created.createdAt).toEqual(expect.any(String));
    expect(created.updatedAt).toBe(created.createdAt);
    expect(result.current.activeNoteState).toEqual(created);
    expect(repo.createNote).toHaveBeenCalledWith(created);
    expect(result.current.loadingSaveNote).toBe(false);
  });

  it("muestra pendiente mientras crear o borrar están en curso", async () => {
    const repo = fakeRepository([note("a")]);
    const create = deferred<INotes>();
    const remove = deferred<void>();
    repo.createNote.mockReturnValueOnce(create.promise);
    repo.deleteNote.mockReturnValueOnce(remove.promise);
    const { result } = await renderNotes(repo);

    // Sin devolver la promesa: act esperaría a que se resuelva
    await act(async () => {
      void result.current.addNote();
    });
    expect(result.current.loadingSaveNote).toBe(true);
    await act(async () => create.resolve(result.current.notes[1]));
    expect(result.current.loadingSaveNote).toBe(false);

    await act(async () => {
      void result.current.deleteNote("a");
    });
    expect(result.current.loadingSaveNote).toBe(true);
    await act(async () => remove.resolve());
    expect(result.current.loadingSaveNote).toBe(false);
  });

  it("guarda una sola vez a los 2 s de la última edición y no entra en loop", async () => {
    const repo = fakeRepository([note("a")]);
    const { result } = await renderNotes(repo);
    await act(async () => result.current.setActiveNote("a"));

    await act(async () => result.current.updateActiveNote({ title: "v1" }));
    expect(result.current.loadingSaveNote).toBe(true);
    await advance(1000);
    await act(async () => result.current.updateActiveNote({ title: "v2" }));
    await advance(1999);
    expect(repo.saveNote).not.toHaveBeenCalled();

    await advance(1);
    expect(repo.saveNote).toHaveBeenCalledTimes(1);
    expect(repo.saveNote.mock.calls[0][0].title).toBe("v2");
    expect(result.current.loadingSaveNote).toBe(false);

    // Sin ediciones nuevas no vuelve a guardar
    await advance(DELAY * 5);
    expect(repo.saveNote).toHaveBeenCalledTimes(1);
  });

  it("al guardar actualiza updatedAt y conserva createdAt", async () => {
    const repo = fakeRepository([note("a")]);
    const { result } = await renderNotes(repo);
    await act(async () => result.current.setActiveNote("a"));

    await act(async () => result.current.updateActiveNote({ title: "Nuevo" }));
    await advance(DELAY);

    const saved = result.current.notes[0];
    expect(saved.title).toBe("Nuevo");
    expect(saved.createdAt).toBe("2026-11-01T10:00:00.000Z");
    expect(saved.updatedAt).not.toBe("2026-11-01T10:00:00.000Z");
    expect(result.current.activeNoteState?.updatedAt).toBe(saved.updatedAt);
  });

  it("cambiar de nota con cambios pendientes guarda ya la nota que se deja", async () => {
    const repo = fakeRepository([note("a"), note("b")]);
    const { result } = await renderNotes(repo);
    await act(async () => result.current.setActiveNote("a"));
    await act(async () => result.current.updateActiveNote({ title: "A editada" }));

    await act(async () => result.current.setActiveNote("b"));

    expect(repo.saveNote).toHaveBeenCalledTimes(1);
    expect(repo.saveNote.mock.calls[0][0]).toMatchObject({
      id: "a",
      title: "A editada",
    });
    expect(result.current.activeNoteState?.id).toBe("b");
    expect(result.current.notes[0].title).toBe("A editada");
  });

  it("cerrar la nota con cambios pendientes la guarda ya", async () => {
    const repo = fakeRepository([note("a")]);
    const { result } = await renderNotes(repo);
    await act(async () => result.current.setActiveNote("a"));
    await act(async () => result.current.updateActiveNote({ title: "Cerrada" }));

    await act(async () => result.current.closeActiveNote());

    expect(repo.saveNote).toHaveBeenCalledTimes(1);
    expect(repo.saveNote.mock.calls[0][0].title).toBe("Cerrada");
    expect(result.current.activeNoteState).toBeNull();
  });

  it("cambiar de nota sin cambios no guarda nada", async () => {
    const repo = fakeRepository([note("a"), note("b")]);
    const { result } = await renderNotes(repo);
    await act(async () => result.current.setActiveNote("a"));
    await act(async () => result.current.setActiveNote("b"));
    await act(async () => result.current.closeActiveNote());
    await advance(DELAY * 2);

    expect(repo.saveNote).not.toHaveBeenCalled();
  });

  it("removeThinking quita el thinking y guarda ya, sin reordenar los demás", async () => {
    const repo = fakeRepository([note("a")]);
    const { result } = await renderNotes(repo);
    await act(async () => result.current.setActiveNote("a"));

    await act(async () => result.current.removeThinking("a-2"));

    const ids = ["a-1", "a-3"];
    expect(result.current.activeNoteState?.thinkings.map((t) => t.id)).toEqual(
      ids,
    );
    expect(repo.saveNote).toHaveBeenCalledTimes(1);
    expect(repo.saveNote.mock.calls[0][0].thinkings.map((t) => t.id)).toEqual(
      ids,
    );
  });

  it("deleteNote la saca de la lista, cierra la activa y la borra", async () => {
    const repo = fakeRepository([note("a"), note("b")]);
    const { result } = await renderNotes(repo);
    await act(async () => result.current.setActiveNote("a"));

    await act(async () => result.current.deleteNote("a"));

    expect(result.current.notes.map((n) => n.id)).toEqual(["b"]);
    expect(result.current.activeNoteState).toBeNull();
    expect(repo.deleteNote).toHaveBeenCalledWith("a");
  });

  it("mantiene estable la identidad de saveUpdatesNotesOnDBorLocalStorage", async () => {
    const repo = fakeRepository([note("a")]);
    const { result } = await renderNotes(repo);
    const first = result.current.saveUpdatesNotesOnDBorLocalStorage;

    await act(async () => result.current.setActiveNote("a"));
    await act(async () => result.current.updateActiveNote({ title: "x" }));
    await advance(DELAY);

    expect(result.current.saveUpdatesNotesOnDBorLocalStorage).toBe(first);
  });

  describe("reorderNotes (US2)", () => {
    const ids = (notes: INotes[]) => notes.map((n) => n.id);

    it("reordena las notas y guarda el orden", async () => {
      const repo = fakeRepository([note("a"), note("b"), note("c")]);
      const { result } = await renderNotes(repo);

      await act(async () => result.current.reorderNotes("c", "a"));

      expect(ids(result.current.notes)).toEqual(["c", "a", "b"]);
      expect(repo.saveOrder).toHaveBeenCalledWith(["c", "a", "b"]);
      expect(result.current.reorderError).toBeNull();
    });

    it("no guarda nada si se suelta en la misma posición o con un id inexistente", async () => {
      const repo = fakeRepository([note("a"), note("b")]);
      const { result } = await renderNotes(repo);
      const before = result.current.notes;

      await act(async () => result.current.reorderNotes("a", "a"));
      await act(async () => result.current.reorderNotes("x", "a"));

      expect(result.current.notes).toBe(before);
      expect(repo.saveOrder).not.toHaveBeenCalled();
    });

    it("mantiene abierta la nota activa y no cambia updatedAt", async () => {
      const repo = fakeRepository([note("a"), note("b")]);
      const { result } = await renderNotes(repo);
      await act(async () => result.current.setActiveNote("a"));

      await act(async () => result.current.reorderNotes("b", "a"));

      expect(result.current.activeNoteState?.id).toBe("a");
      expect(result.current.notes.map((n) => n.updatedAt)).toEqual([
        "2026-11-01T10:00:00.000Z",
        "2026-11-01T10:00:00.000Z",
      ]);
    });

    it("si falla vuelve al orden anterior sin perder cambios de contenido y avisa", async () => {
      const repo = fakeRepository([note("a"), note("b"), note("c")]);
      const order = deferred<void>();
      repo.saveOrder.mockReturnValueOnce(order.promise);
      const { result } = await renderNotes(repo);
      await act(async () => result.current.setActiveNote("b"));

      await act(async () => {
        void result.current.reorderNotes("c", "a");
      });
      // Mientras se guarda el orden, se edita una nota y se la deja
      await act(async () => result.current.updateActiveNote({ title: "B editada" }));
      await act(async () => result.current.closeActiveNote());
      await act(async () => order.reject(new Error("falla")));

      expect(ids(result.current.notes)).toEqual(["a", "b", "c"]);
      expect(result.current.notes[1].title).toBe("B editada");
      expect(result.current.reorderError).toBe(
        "No se pudo guardar el orden de las notas.",
      );
    });

    it("clearReorderError limpia el error y tiene identidad estable", async () => {
      const repo = fakeRepository([note("a"), note("b")]);
      repo.saveOrder.mockRejectedValueOnce(new Error("falla"));
      jest.spyOn(console, "error").mockImplementation(() => {});
      const { result } = await renderNotes(repo);
      const clear = result.current.clearReorderError;

      await act(async () => result.current.reorderNotes("b", "a"));
      expect(result.current.reorderError).not.toBeNull();

      await act(async () => result.current.clearReorderError());
      expect(result.current.reorderError).toBeNull();
      expect(result.current.clearReorderError).toBe(clear);
    });
  });

  describe("fallas del almacenamiento (US4)", () => {
    beforeEach(() => {
      jest.spyOn(console, "error").mockImplementation(() => {});
    });

    it("si falla la carga queda usable, avisa y no escribe nada", async () => {
      const repo = fakeRepository();
      repo.loadNotes.mockRejectedValueOnce(new Error("lectura"));

      const { result } = await renderNotes(repo);

      expect(result.current.notes).toEqual([]);
      expect(result.current.waitingResponse).toBe("none");
      expect(result.current.loadError).toBe("No se pudieron cargar las notas.");
      expect(repo.createNote).not.toHaveBeenCalled();
      expect(repo.saveNote).not.toHaveBeenCalled();
      expect(repo.deleteNote).not.toHaveBeenCalled();
      expect(repo.saveOrder).not.toHaveBeenCalled();
    });

    it("si falla el guardado, lo escrito sigue en memoria y pendiente; el siguiente guardado lo limpia", async () => {
      const repo = fakeRepository([note("a")]);
      repo.saveNote.mockRejectedValueOnce(new Error("escritura"));
      const { result } = await renderNotes(repo);
      await act(async () => result.current.setActiveNote("a"));

      await act(async () => result.current.updateActiveNote({ title: "Importante" }));
      await advance(DELAY);

      expect(repo.saveNote).toHaveBeenCalledTimes(1);
      expect(result.current.activeNoteState?.title).toBe("Importante");
      expect(result.current.loadingSaveNote).toBe(true);
      expect(result.current.saveError).toBe("No se pudieron guardar los cambios.");

      await act(async () => result.current.updateActiveNote({ title: "Importante!" }));
      await advance(DELAY);

      expect(repo.saveNote).toHaveBeenCalledTimes(2);
      expect(repo.saveNote.mock.calls[1][0].title).toBe("Importante!");
      expect(result.current.saveError).toBeNull();
      expect(result.current.loadingSaveNote).toBe(false);
    });

    it("si falla el guardado al cambiar de nota, los cambios quedan en memoria y se reintentan", async () => {
      const repo = fakeRepository([note("a"), note("b")]);
      repo.saveNote.mockRejectedValueOnce(new Error("escritura"));
      const { result } = await renderNotes(repo);
      await act(async () => result.current.setActiveNote("a"));
      await act(async () => result.current.updateActiveNote({ title: "A sin guardar" }));

      await act(async () => result.current.setActiveNote("b"));

      expect(result.current.notes[0].title).toBe("A sin guardar");
      expect(result.current.loadingSaveNote).toBe(true);
      expect(result.current.saveError).not.toBeNull();

      // Al volver a abrirla se ven los cambios
      await act(async () => result.current.setActiveNote("a"));
      expect(result.current.activeNoteState?.title).toBe("A sin guardar");

      // Un guardado posterior (de cualquier nota) la reintenta
      await act(async () => result.current.updateActiveNote({ title: "A otra vez" }));
      await advance(DELAY);
      await act(async () => result.current.setActiveNote("b"));
      await act(async () => result.current.updateActiveNote({ title: "B" }));
      await advance(DELAY);

      const savedA = repo.saveNote.mock.calls.filter(([n]) => n.id === "a");
      expect(savedA.at(-1)?.[0].title).toBe("A otra vez");
      expect(result.current.saveError).toBeNull();
      expect(result.current.loadingSaveNote).toBe(false);
    });

    it("una nota que no se pudo crear sigue en la lista y el siguiente guardado la inserta", async () => {
      const repo = fakeRepository([note("a")]);
      repo.createNote.mockRejectedValueOnce(new Error("escritura"));
      const { result } = await renderNotes(repo);

      await act(async () => result.current.addNote());
      const created = result.current.notes[1];

      expect(created.title).toBe("Nueva Nota :)");
      expect(result.current.saveError).toBe("No se pudieron guardar los cambios.");
      expect(result.current.loadingSaveNote).toBe(true);

      await act(async () => result.current.saveUpdatesNotesOnDBorLocalStorage());

      expect(repo.saveNote).toHaveBeenCalledWith(
        expect.objectContaining({ id: created.id }),
      );
      expect(result.current.saveError).toBeNull();
      expect(result.current.loadingSaveNote).toBe(false);
    });

    it("si falla el borrado, la nota vuelve a su lugar y avisa", async () => {
      const repo = fakeRepository([note("a"), note("b"), note("c")]);
      repo.deleteNote.mockRejectedValueOnce(new Error("escritura"));
      const { result } = await renderNotes(repo);

      await act(async () => result.current.deleteNote("b"));

      expect(result.current.notes.map((n) => n.id)).toEqual(["a", "b", "c"]);
      expect(result.current.saveError).toBe("No se pudo borrar la nota.");
    });

    it("una edición durante un guardado en vuelo deja la nota como pendiente", async () => {
      const repo = fakeRepository([note("a")]);
      const save = deferred<INotes>();
      repo.saveNote.mockReturnValueOnce(save.promise);
      const { result } = await renderNotes(repo);
      await act(async () => result.current.setActiveNote("a"));
      await act(async () => result.current.updateActiveNote({ title: "1" }));
      await advance(DELAY);

      await act(async () => result.current.updateActiveNote({ title: "2" }));
      await act(async () => save.resolve(repo.saveNote.mock.calls[0][0]));

      expect(result.current.loadingSaveNote).toBe(true);
      expect(result.current.activeNoteState?.title).toBe("2");
    });
  });
});
