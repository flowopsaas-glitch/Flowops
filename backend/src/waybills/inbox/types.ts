export type InboxUploadSource = "UPLOAD" | "WHATSAPP" | "EMAIL" | "DRIVER_PHOTO" | "SCANNER";

export type ExtractionField<T> = {
  value: T | null;
  confidence: number; // 0..100
  reason?: string;
};

export type ExtractionResult = {
  overallConfidence: number;
  notes?: string;

  waybillNo?: ExtractionField<string>;
  contractCode?: ExtractionField<string>;
  paymentType?: ExtractionField<"PREPAID" | "COD">;
  codAmount?: ExtractionField<number>;

  chargeSide?: ExtractionField<"SENDER" | "RECEIVER">;

  senderName?: ExtractionField<string>;
  senderPhone?: ExtractionField<string>;
  senderAddress1?: ExtractionField<string>;
  senderCity?: ExtractionField<string>;

  receiverName?: ExtractionField<string>;
  receiverPhone?: ExtractionField<string>;
  receiverAddress1?: ExtractionField<string>;
  receiverCity?: ExtractionField<string>;

  reference?: ExtractionField<string>;

  parcels?: ExtractionField<
    Array<{
      qty: number;
      weightKg: number;
      lengthCm: number;
      widthCm: number;
      heightCm: number;
    }>
  >;
};