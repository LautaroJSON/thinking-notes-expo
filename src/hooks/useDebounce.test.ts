import { act, renderHook } from "@testing-library/react-native";
import type { INotes } from "@/types";
import { useDebounce } from "./useDebounce";

const note = (title: string): INotes => ({ id: "1", title, thinkings: [] });

describe("useDebounce", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("devuelve el valor inicial de inmediato", async () => {
    const initial = note("inicial");
    const { result } = await renderHook(() => useDebounce(initial, 500));

    expect(result.current).toBe(initial);
  });

  it("solo actualiza el valor cuando pasa el delay sin cambios", async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: INotes }) => useDebounce(value, 500),
      { initialProps: { value: note("v1") } },
    );

    const v2 = note("v2");
    await rerender({ value: v2 });
    await act(async () => {
      jest.advanceTimersByTime(499);
    });
    expect(result.current?.title).toBe("v1");

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(v2);
  });

  it("reinicia la espera si el valor cambia antes del delay", async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: INotes }) => useDebounce(value, 500),
      { initialProps: { value: note("v1") } },
    );

    await rerender({ value: note("v2") });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await rerender({ value: note("v3") });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current?.title).toBe("v1");

    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current?.title).toBe("v3");
  });
});
