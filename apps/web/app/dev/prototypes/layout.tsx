import { TooltipProvider } from "@metobe/ui/components/tooltip";
import { notFound } from "next/navigation";

// Prototypes stay here while we build; local development only.
const PrototypesLayout = ({ children }: { children: React.ReactNode }) => {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <TooltipProvider>{children}</TooltipProvider>;
};

export default PrototypesLayout;
