CREATE TABLE "catalog_access" (
	"catalog_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "catalog_access_catalog_id_user_id_pk" PRIMARY KEY("catalog_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "access" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "catalog_access" ADD CONSTRAINT "catalog_access_catalog_id_catalog_items_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_access" ADD CONSTRAINT "catalog_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_access" CHECK ("catalog_items"."access" in ('all', 'selected'));