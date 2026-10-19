-- A SKU history page can seek by transaction ID without sorting the whole ledger.
CREATE INDEX inventory_entries_sku_transaction ON inventory_entries(sku_id,transaction_id,line_no);
