import { ChatsView } from "@/components/ChatsView";

// Client-only demo (data lives in browser storage): nothing to prerender, so skip instant-navigation validation.
// Revisit when Phase 2 moves data to the server.
export const instant = false;

export const metadata = { title: "Chats · Garage desk" };

export default function ChatsPage() {
  return <ChatsView />;
}
