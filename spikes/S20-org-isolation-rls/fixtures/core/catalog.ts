// Owning module: the only core module allowed to import this organization-scoped schema.
import { catalogItems } from "@metobe/db/schema/catalog_items";

export function listCatalogItems(orgId: string) {
  return { catalogItems, orgId };
}
