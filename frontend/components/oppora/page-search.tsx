import type { ComponentProps } from "react";
import { SearchBar } from "@/components/ui/search-bar";
import { cn } from "@/lib/utils";

/**
 * A page's own search (pages with `hasOwnSearch`). On mobile it sticks under
 * the 65px header, like the header search does on other pages. Ancestors
 * between it and <main> must be `max-sm:contents` so it can stick for the
 * whole page, not just inside its wrapper.
 */
export function PageSearch({ className, ...props }: ComponentProps<typeof SearchBar>) {
  return (
    <div
      className={cn(
        "max-sm:sticky max-sm:top-[65px] max-sm:z-20 max-sm:-mx-4 max-sm:mb-3 max-sm:bg-bg/80 max-sm:px-4 max-sm:py-2 max-sm:backdrop-blur-xl",
        className,
      )}
    >
      <SearchBar {...props} />
    </div>
  );
}
