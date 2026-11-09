-- ============================================================================
-- Ledger integrity, enforced by the database itself (not just app code).
--   1. ledger_transactions, ledger_entries and audit_log are append-only.
--      Mistakes are corrected with a reversing transaction, never an edit.
--   2. Every ledger transaction balances in AED (sum of debits = sum of credits)
--      and has at least two entries. Checked at COMMIT via a deferred
--      constraint trigger, so entries can be inserted one by one inside a
--      transaction.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed. Post a reversing transaction instead.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_truncate
  BEFORE TRUNCATE ON public.ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_transactions_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_transactions_no_truncate
  BEFORE TRUNCATE ON public.ledger_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.assert_transaction_balanced()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  debits  numeric;
  credits numeric;
  lines   integer;
BEGIN
  SELECT
    coalesce(sum(amount_aed) FILTER (WHERE direction = 'DEBIT'), 0),
    coalesce(sum(amount_aed) FILTER (WHERE direction = 'CREDIT'), 0),
    count(*)
  INTO debits, credits, lines
  FROM public.ledger_entries
  WHERE transaction_id = NEW.transaction_id;

  IF lines < 2 THEN
    RAISE EXCEPTION 'Ledger transaction % needs at least two entries (has %)', NEW.transaction_id, lines
      USING ERRCODE = 'check_violation';
  END IF;
  IF debits <> credits THEN
    RAISE EXCEPTION 'Ledger transaction % is unbalanced: debits % AED, credits % AED', NEW.transaction_id, debits, credits
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON public.ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_transaction_balanced();
--> statement-breakpoint
ALTER TABLE public.ledger_transactions
  ADD CONSTRAINT ledger_transactions_reverses_fk
  FOREIGN KEY (reverses_id) REFERENCES public.ledger_transactions(id);
--> statement-breakpoint
-- Derived balances per account in AED. Debit-normal accounts (assets, expenses)
-- are positive when debited; credit-normal accounts when credited.
-- security_invoker: the view runs with the caller's RLS (finance only).
CREATE VIEW public.account_balances WITH (security_invoker = true) AS
SELECT
  a.code,
  a.name,
  a.type,
  coalesce(sum(
    CASE
      WHEN a.type IN ('ASSET', 'EXPENSE') THEN
        CASE e.direction WHEN 'DEBIT' THEN e.amount_aed ELSE -e.amount_aed END
      ELSE
        CASE e.direction WHEN 'CREDIT' THEN e.amount_aed ELSE -e.amount_aed END
    END
  ), 0)::numeric(14,2) AS balance_aed
FROM public.accounts a
LEFT JOIN public.ledger_entries e ON e.account_code = a.code
GROUP BY a.code, a.name, a.type;
