import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";

/** The main button of a sign-in step: full width, and a spinner in place of the label while pending. */
export const SubmitButton = ({
  pending,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean }) => (
  <Button
    className={cn("relative h-10 w-full", className)}
    disabled={pending}
    type="submit"
    {...props}
  >
    <span className={cn(pending && "opacity-0")}>{children}</span>
    {pending && <Spinner className="absolute" />}
  </Button>
);
