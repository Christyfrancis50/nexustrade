ALTER POLICY "documents_select" ON "documents" TO authenticated USING ((select private.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
ALTER POLICY "documents_insert" ON "documents" TO authenticated WITH CHECK ((select private.current_user_role()) in ('coordinator'));--> statement-breakpoint
ALTER POLICY "line_items_select" ON "line_items" TO authenticated USING ((select private.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
ALTER POLICY "line_items_insert" ON "line_items" TO authenticated WITH CHECK ((select private.current_user_role()) in ('coordinator'));--> statement-breakpoint
ALTER POLICY "line_items_update" ON "line_items" TO authenticated USING ((select private.current_user_role()) in ('coordinator', 'broker')) WITH CHECK ((select private.current_user_role()) in ('coordinator', 'broker'));--> statement-breakpoint
ALTER POLICY "shipments_select" ON "shipments" TO authenticated USING ((select private.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
ALTER POLICY "shipments_insert" ON "shipments" TO authenticated WITH CHECK ((select private.current_user_role()) in ('coordinator'));--> statement-breakpoint
ALTER POLICY "shipments_update" ON "shipments" TO authenticated USING ((select private.current_user_role()) in ('coordinator', 'broker')) WITH CHECK ((select private.current_user_role()) in ('coordinator', 'broker'));--> statement-breakpoint
ALTER POLICY "classification_select" ON "classification_decisions" TO authenticated USING ((select private.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
ALTER POLICY "classification_insert" ON "classification_decisions" TO authenticated WITH CHECK ((select private.current_user_role()) in ('broker'));--> statement-breakpoint
ALTER POLICY "hs_codes_select" ON "hs_codes" TO authenticated USING ((select private.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
ALTER POLICY "accounts_select" ON "accounts" TO authenticated USING ((select private.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
ALTER POLICY "audit_select" ON "audit_log" TO authenticated USING ((select private.current_user_role()) in ('finance'));--> statement-breakpoint
ALTER POLICY "escrow_select" ON "escrow_milestones" TO authenticated USING ((select private.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
ALTER POLICY "fx_rates_select" ON "fx_rates" TO authenticated USING ((select private.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
ALTER POLICY "invoices_select" ON "invoices" TO authenticated USING ((select private.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
ALTER POLICY "ledger_entries_select" ON "ledger_entries" TO authenticated USING ((select private.current_user_role()) in ('finance'));--> statement-breakpoint
ALTER POLICY "ledger_tx_select" ON "ledger_transactions" TO authenticated USING ((select private.current_user_role()) in ('finance'));--> statement-breakpoint
ALTER POLICY "payouts_select" ON "payouts" TO authenticated USING ((select private.current_user_role()) in ('finance'));