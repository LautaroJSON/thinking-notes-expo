import { Stack } from "expo-router";
import { NotesProvider } from "@/context/notesContext";

export default function RootLayout() {
  return (
    <NotesProvider>
      <Stack />
    </NotesProvider>
  );
}
