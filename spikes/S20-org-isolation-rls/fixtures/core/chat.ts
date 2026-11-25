// Deliberate violation: chat must call the catalog core function instead of importing its table.
import { catalogItems } from "@metobe/db/schema/catalog_items";

export function getChatCatalog() {
  return catalogItems;
}
