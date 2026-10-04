import { NewChatPrototype } from "./load";

// The new chat's screen, round 2: after ReUI's ai-chat-3 (the user's pick over round 1) — the greeting, «Начать с»
// rows that put a source into the question, «Продолжить» with the last chats, the composer at the bottom from the
// start. What the variants try is where the Hairline picture goes in it, if anywhere. Round 1: ./round-1.
const NewChatPrototypePage = () => <NewChatPrototype round={2} />;

export default NewChatPrototypePage;
