DO $$
BEGIN
	ALTER TABLE "quickbooks_connections"
		ADD CONSTRAINT "quickbooks_connections_id_center_unique"
		UNIQUE ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "quickbooks_entity_links" qel
		JOIN "quickbooks_connections" qc ON qc."id" = qel."connection_id"
		WHERE qc."center_id" <> qel."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add quickbooks_entity_links_connection_center_fk: cross-center QuickBooks entity link connection rows exist';
	END IF;

	ALTER TABLE "quickbooks_entity_links"
		ADD CONSTRAINT "quickbooks_entity_links_connection_center_fk"
		FOREIGN KEY ("connection_id", "center_id")
		REFERENCES "quickbooks_connections" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "quickbooks_sync_log" qsl
		JOIN "quickbooks_connections" qc ON qc."id" = qsl."connection_id"
		WHERE qc."center_id" <> qsl."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add quickbooks_sync_log_connection_center_fk: cross-center QuickBooks sync log connection rows exist';
	END IF;

	ALTER TABLE "quickbooks_sync_log"
		ADD CONSTRAINT "quickbooks_sync_log_connection_center_fk"
		FOREIGN KEY ("connection_id", "center_id")
		REFERENCES "quickbooks_connections" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "quickbooks_reconciliation_items" qri
		JOIN "quickbooks_connections" qc ON qc."id" = qri."connection_id"
		WHERE qc."center_id" <> qri."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add quickbooks_reconciliation_items_connection_center_fk: cross-center QuickBooks reconciliation connection rows exist';
	END IF;

	ALTER TABLE "quickbooks_reconciliation_items"
		ADD CONSTRAINT "quickbooks_reconciliation_items_connection_center_fk"
		FOREIGN KEY ("connection_id", "center_id")
		REFERENCES "quickbooks_connections" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "quickbooks_reconciliation_items" qri
		JOIN "memberships" m ON m."id" = qri."reviewed_by_membership_id"
		WHERE qri."reviewed_by_membership_id" IS NOT NULL
			AND m."center_id" <> qri."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add quickbooks_reconciliation_items_reviewed_by_center_fk: cross-center QuickBooks reconciliation reviewer rows exist';
	END IF;

	ALTER TABLE "quickbooks_reconciliation_items"
		ADD CONSTRAINT "quickbooks_reconciliation_items_reviewed_by_center_fk"
		FOREIGN KEY ("reviewed_by_membership_id", "center_id")
		REFERENCES "memberships" ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
