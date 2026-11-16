import { Stack } from "expo-router";
import { VerificationScreen } from "@/components/dev/VerificationScreen";

export default function Index() {
  return (
    <>
      <Stack.Screen options={{ title: "Thinking Notes" }} />
      <VerificationScreen />
    </>
  );
}
