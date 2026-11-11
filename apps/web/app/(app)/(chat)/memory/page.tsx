import { MemoryView } from "@/components/memory/memory-view";

// The «Память» page (ARCH §19, P16): what the memory keeps of the person's work — to look at, correct and delete.
// Its data is read by the memory's store in the chat shell (the list stands in the sidebar, beside the page), so the
// page itself reads nothing: it is the card, the calendar and the rest of what is picked in the list.
const MemoryPage = () => <MemoryView />;

export default MemoryPage;
