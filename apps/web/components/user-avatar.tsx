import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@metobe/ui/components/avatar";
import { cn } from "@metobe/ui/lib/utils";

/** The letters of a name: its first two words' first letters. */
export const initials = (name: string) =>
  name
    .split(/\s+/u)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** A person's picture — or their initials on the theme's color when they have none — in the rounded square of the logos. */
export const UserAvatar = ({
  name,
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) => (
  <Avatar className={cn("size-8 rounded-[28%] after:rounded-[28%]", className)}>
    {image && <AvatarImage alt="" className="rounded-[28%]" src={image} />}
    <AvatarFallback className="bg-primary text-primary-foreground rounded-[28%] text-xs font-medium">
      {initials(name)}
    </AvatarFallback>
  </Avatar>
);
