CREATE TABLE "dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"graph_id" uuid NOT NULL,
	"from_service" uuid NOT NULL,
	"to_service" uuid NOT NULL,
	"kind" text DEFAULT 'sync' NOT NULL,
	"critical" boolean DEFAULT true NOT NULL,
	CONSTRAINT "dependencies_edge_uq" UNIQUE("from_service","to_service"),
	CONSTRAINT "dependencies_no_self_check" CHECK ("dependencies"."from_service" <> "dependencies"."to_service"),
	CONSTRAINT "dependencies_kind_check" CHECK ("dependencies"."kind" in ('sync','async','data'))
);
--> statement-breakpoint
CREATE TABLE "graphs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graphs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"graph_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'service' NOT NULL,
	"tier" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_graph_key_uq" UNIQUE("graph_id","key"),
	CONSTRAINT "services_kind_check" CHECK ("services"."kind" in ('service','database','cache','queue','gateway'))
);
--> statement-breakpoint
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_graph_id_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_from_service_services_id_fk" FOREIGN KEY ("from_service") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_to_service_services_id_fk" FOREIGN KEY ("to_service") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_graph_id_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graphs"("id") ON DELETE cascade ON UPDATE no action;