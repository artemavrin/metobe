import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@metobe/ui/components/empty";
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A page that says what went wrong and offers the way on: a missing page, an error. */
export const StatusPage = ({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  /** The actions: back to the chats, try again. */
  children: ReactNode;
}) => (
  <div className="flex min-h-[70dvh] flex-1 items-center justify-center px-6">
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <IconTile size="lg" variant="frame">
            <Icon />
          </IconTile>
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        {children}
      </EmptyContent>
    </Empty>
  </div>
);
