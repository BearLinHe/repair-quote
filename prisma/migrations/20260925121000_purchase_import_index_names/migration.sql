ALTER INDEX "PurchaseOrder_clerk_user_id_supplier_key_supplier_invoice_key_k"
  RENAME TO "purchase_supplier_invoice_unique";
ALTER INDEX "SupplierPartMapping_clerk_user_id_supplier_key_item_number_ke_k"
  RENAME TO "supplier_part_mapping_unique";
