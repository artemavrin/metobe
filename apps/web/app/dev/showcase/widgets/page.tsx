import { notFound } from "next/navigation";

import { Widgets } from "./widgets";

// Chat widgets built from a tool's result, in each state the chat shows them in. Local development only.
const WidgetsPage = () => {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Widgets />;
};

export default WidgetsPage;
