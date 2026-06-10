import * as z from "zod";

// =============================================================================
// BASE SCHEMAS - Common structures used across all field types
// =============================================================================

/**
 * Represents a span of text in the source document
 */
const spanSchema = z.object({
  length: z.int().positive(),
  offset: z.int().nonnegative(),
});

export interface Span extends z.output<typeof spanSchema> {}

const CONFIDENCE_VALUE_RANGE = {
  MAX: 1,
  MIN: 0,
};

/**
 * Common metadata fields that can appear on any extracted/generated value
 */
const COMMON_METADATA_FIELDS = {
  confidence: z.nullish(
    z.number().min(CONFIDENCE_VALUE_RANGE.MIN).max(CONFIDENCE_VALUE_RANGE.MAX),
  ),
  source: z.nullish(z.string().trim()),
  spans: z.nullish(z.array(spanSchema)),
};

// =============================================================================
// PRIMITIVE FIELD SCHEMAS - String, Number, Date
// =============================================================================

/**
 * String field from Content Understanding API
 * May or may not have an extracted value
 */
const stringFieldSchema = z.object({
  type: z.literal("string"),
  valueString: z.nullish(z.string().trim()),
  ...COMMON_METADATA_FIELDS,
});

export interface StringField extends z.output<typeof stringFieldSchema> {}

/**
 * Number field from Content Understanding API
 */
const numberFieldSchema = z.object({
  type: z.literal("number"),
  valueNumber: z.nullish(z.number()),
  ...COMMON_METADATA_FIELDS,
});

export interface NumberField extends z.output<typeof numberFieldSchema> {}

/**
 * Date field from Content Understanding API
 * valueDate is an ISO 8601 date string (YYYY-MM-DD)
 */
const dateFieldSchema = z.object({
  type: z.literal("date"),
  valueDate: z.nullish(z.iso.date()),
  ...COMMON_METADATA_FIELDS,
});

export interface DateField extends z.output<typeof dateFieldSchema> {}

// =============================================================================
// COMPOSITE FIELD SCHEMAS - Currency amounts, objects with Amount + CurrencyCode
// =============================================================================

/**
 * Currency amount object - common pattern in invoice fields
 */
const currencyAmountObjectSchema = z.object({
  type: z.literal("object"),
  valueObject: z.object({
    Amount: numberFieldSchema,
    CurrencyCode: stringFieldSchema,
  }),
});

export interface CurrencyAmountObject extends z.output<
  typeof currencyAmountObjectSchema
> {}

// =============================================================================
// LINE ITEM SCHEMAS
// =============================================================================

/**
 * Tax amount within a line item
 */
const lineItemTaxAmountSchema = z.object({
  type: z.literal("object"),
  valueObject: z.object({
    Amount: numberFieldSchema,
    CurrencyCode: stringFieldSchema,
  }),
});

/**
 * Individual line item in an invoice
 */
const lineItemObjectSchema = z.object({
  type: z.literal("object"),
  valueObject: z.object({
    Date: z.nullish(dateFieldSchema),
    Description: z.nullish(stringFieldSchema),
    ProductCode: z.nullish(stringFieldSchema),
    Quantity: z.nullish(numberFieldSchema),
    QuantityUnit: z.nullish(stringFieldSchema),
    TaxAmount: z.nullish(lineItemTaxAmountSchema),
    TaxRate: z.nullish(numberFieldSchema),
    TotalAmount: z.nullish(currencyAmountObjectSchema),
    UnitPrice: z.nullish(currencyAmountObjectSchema),
  }),
});

export interface LineItemObject extends z.output<typeof lineItemObjectSchema> {}

/**
 * Array of line items
 */
const lineItemsArraySchema = z.object({
  type: z.literal("array"),
  valueArray: z.nullish(z.array(lineItemObjectSchema)),
});

export interface LineItemsArray extends z.output<typeof lineItemsArraySchema> {}

// =============================================================================
// TAX DETAILS SCHEMAS
// =============================================================================

/**
 * Individual tax detail entry
 */
const taxDetailObjectSchema = z.object({
  type: z.literal("object"),
  valueObject: z.object({
    Amount: z.nullish(currencyAmountObjectSchema),
    Description: z.nullish(stringFieldSchema),
    NetAmount: z.nullish(currencyAmountObjectSchema),
    Rate: z.nullish(numberFieldSchema),
  }),
});

export interface TaxDetailObject extends z.output<
  typeof taxDetailObjectSchema
> {}

/**
 * Array of tax details
 */
const taxDetailsArraySchema = z.object({
  type: z.literal("array"),
  valueArray: z.nullish(z.array(taxDetailObjectSchema)),
});

export interface TaxDetailsArray extends z.output<
  typeof taxDetailsArraySchema
> {}

// =============================================================================
// MAIN INVOICE ANALYSIS SCHEMA
// =============================================================================

/**
 * Complete invoice analysis result from Azure Content Understanding API
 * All fields are optional since not all invoices contain all fields
 */
export const invoiceAnalysisSchema = z.object({
  // Amount fields
  AmountDue: z.nullish(currencyAmountObjectSchema),
  BalanceForward: z.nullish(currencyAmountObjectSchema),
  SubtotalAmount: z.nullish(currencyAmountObjectSchema),
  TotalAmount: z.nullish(currencyAmountObjectSchema),
  TotalDiscountAmount: z.nullish(currencyAmountObjectSchema),
  TotalTaxAmount: z.nullish(currencyAmountObjectSchema),

  // Address fields
  BillingAddress: z.nullish(stringFieldSchema),
  BillingAddressRecipient: z.nullish(stringFieldSchema),
  CustomerAddress: z.nullish(stringFieldSchema),
  CustomerAddressRecipient: z.nullish(stringFieldSchema),
  RemittanceAddress: z.nullish(stringFieldSchema),
  RemittanceAddressRecipient: z.nullish(stringFieldSchema),
  ServiceAddress: z.nullish(stringFieldSchema),
  ServiceAddressRecipient: z.nullish(stringFieldSchema),
  ShippingAddress: z.nullish(stringFieldSchema),
  ShippingAddressRecipient: z.nullish(stringFieldSchema),
  VendorAddress: z.nullish(stringFieldSchema),
  VendorAddressRecipient: z.nullish(stringFieldSchema),

  // Customer fields
  CustomerId: z.nullish(stringFieldSchema),
  CustomerName: z.nullish(stringFieldSchema),
  CustomerTaxId: z.nullish(stringFieldSchema),

  // Vendor fields
  VendorName: z.nullish(stringFieldSchema),
  VendorTaxId: z.nullish(stringFieldSchema),

  // Invoice metadata
  CountryRegion: z.nullish(stringFieldSchema),
  DueDate: z.nullish(dateFieldSchema),
  InvoiceDate: z.nullish(dateFieldSchema),
  InvoiceId: z.nullish(stringFieldSchema),
  PaymentTerm: z.nullish(stringFieldSchema),
  PONumber: z.nullish(stringFieldSchema),

  // Line items and tax details
  LineItems: z.nullish(lineItemsArraySchema),
  TaxDetails: z.nullish(taxDetailsArraySchema),
});

export interface InvoiceAnalysis extends z.output<
  typeof invoiceAnalysisSchema
> {}

// =============================================================================
// SIMPLIFIED/CLEAN INVOICE TYPE - For application use after extraction
// =============================================================================

/**
 * Clean invoice data structure for application use
 * This strips away the API metadata and provides just the values
 */
export const cleanInvoiceSchema = z.object({
  // Amounts
  amountDue: z.nullish(
    z.object({
      amount: z.number(),
      currency: z.string().trim(),
    }),
  ),
  balanceForward: z.nullish(
    z.object({
      amount: z.number(),
      currency: z.string().trim(),
    }),
  ),
  subtotalAmount: z.nullish(
    z.object({
      amount: z.number(),
      currency: z.string().trim(),
    }),
  ),
  totalAmount: z.nullish(
    z.object({
      amount: z.number(),
      currency: z.string().trim(),
    }),
  ),
  totalDiscountAmount: z.nullish(
    z.object({
      amount: z.number(),
      currency: z.string().trim(),
    }),
  ),
  totalTaxAmount: z.nullish(
    z.object({
      amount: z.number(),
      currency: z.string().trim(),
    }),
  ),

  // Addresses
  billingAddress: z.nullish(z.string().trim()),
  billingAddressRecipient: z.nullish(z.string().trim()),
  customerAddress: z.nullish(z.string().trim()),
  customerAddressRecipient: z.nullish(z.string().trim()),
  remittanceAddress: z.nullish(z.string().trim()),
  remittanceAddressRecipient: z.nullish(z.string().trim()),
  serviceAddress: z.nullish(z.string().trim()),
  serviceAddressRecipient: z.nullish(z.string().trim()),
  shippingAddress: z.nullish(z.string().trim()),
  shippingAddressRecipient: z.nullish(z.string().trim()),
  vendorAddress: z.nullish(z.string().trim()),
  vendorAddressRecipient: z.nullish(z.string().trim()),

  // Customer info
  customerId: z.nullish(z.string().trim()),
  customerName: z.nullish(z.string().trim()),
  customerTaxId: z.nullish(z.string().trim()),

  // Vendor info
  vendorName: z.nullish(z.string().trim()),
  vendorTaxId: z.nullish(z.string().trim()),

  // Invoice metadata
  countryRegion: z.nullish(z.string().trim()),
  dueDate: z.nullish(z.date()),
  invoiceDate: z.nullish(z.date()),
  invoiceId: z.nullish(z.string().trim()),
  paymentTerm: z.nullish(z.string().trim()),
  poNumber: z.nullish(z.string().trim()),

  // Line items
  lineItems: z.nullish(
    z.array(
      z.object({
        date: z.nullish(z.date()),
        description: z.nullish(z.string().trim()),
        productCode: z.nullish(z.string().trim()),
        quantity: z.nullish(z.number()),
        quantityUnit: z.nullish(z.string().trim()),
        taxAmount: z.nullish(
          z.object({
            amount: z.number(),
            currency: z.string().trim(),
          }),
        ),
        taxRate: z.nullish(z.number()),
        totalAmount: z.nullish(
          z.object({
            amount: z.number(),
            currency: z.string().trim(),
          }),
        ),
        unitPrice: z.nullish(
          z.object({
            amount: z.number(),
            currency: z.string().trim(),
          }),
        ),
      }),
    ),
  ),

  // Tax details
  taxDetails: z.nullish(
    z.array(
      z.object({
        amount: z.nullish(
          z.object({
            amount: z.number(),
            currency: z.string().trim(),
          }),
        ),
        description: z.nullish(z.string().trim()),
        netAmount: z.nullish(
          z.object({
            amount: z.number(),
            currency: z.string().trim(),
          }),
        ),
        rate: z.nullish(z.number()),
      }),
    ),
  ),
});

export interface CleanInvoice extends z.output<typeof cleanInvoiceSchema> {}

// =============================================================================
// HELPER FUNCTIONS - Extract clean values from the API response
// =============================================================================

/**
 * Extract the actual value from a string field, or null if not present
 */
function extractString(field: StringField | null | undefined) {
  return field?.valueString ?? null;
}

/**
 * Extract the actual value from a number field, or null if not present
 */
function extractNumber(field: NumberField | null | undefined) {
  return field?.valueNumber ?? null;
}

/**
 * Extract the actual value from a date field as a Date object, or null
 */
function extractDate(field: DateField | null | undefined) {
  return typeof field?.valueDate === "string"
    ? new Date(field.valueDate)
    : null;
}

/**
 * Extract amount and currency from a currency amount object
 */
function extractCurrencyAmount(field: CurrencyAmountObject | null | undefined) {
  if (field?.valueObject == null) return null;

  const amount = field.valueObject.Amount.valueNumber;

  const currency = field.valueObject.CurrencyCode.valueString;

  if (amount == null) return null;

  return {
    amount,
    currency: currency ?? "USD",
  };
}

const HIGH_CONFIDENCE_THRESHOLD = 0.8;

const FALLBACK_CONFIDENCE_VALUE = 0;

interface ConfidenceField {
  confidence?: number | null;
}

/**
 * Check if a field has high confidence (above threshold)
 */
export const hasHighConfidence = (
  field: ConfidenceField | null | undefined,
  threshold: number = HIGH_CONFIDENCE_THRESHOLD,
) => {
  return (field?.confidence ?? FALLBACK_CONFIDENCE_VALUE) >= threshold;
};

/**
 * Transform raw API response to clean invoice data
 */
export const transformToCleanInvoice = (raw: InvoiceAnalysis): CleanInvoice => {
  return {
    // Amounts
    amountDue: extractCurrencyAmount(raw.AmountDue),
    balanceForward: extractCurrencyAmount(raw.BalanceForward),
    subtotalAmount: extractCurrencyAmount(raw.SubtotalAmount),
    totalAmount: extractCurrencyAmount(raw.TotalAmount),
    totalDiscountAmount: extractCurrencyAmount(raw.TotalDiscountAmount),
    totalTaxAmount: extractCurrencyAmount(raw.TotalTaxAmount),

    // Addresses
    billingAddress: extractString(raw.BillingAddress),
    billingAddressRecipient: extractString(raw.BillingAddressRecipient),
    customerAddress: extractString(raw.CustomerAddress),
    customerAddressRecipient: extractString(raw.CustomerAddressRecipient),
    remittanceAddress: extractString(raw.RemittanceAddress),
    remittanceAddressRecipient: extractString(raw.RemittanceAddressRecipient),
    serviceAddress: extractString(raw.ServiceAddress),
    serviceAddressRecipient: extractString(raw.ServiceAddressRecipient),
    shippingAddress: extractString(raw.ShippingAddress),
    shippingAddressRecipient: extractString(raw.ShippingAddressRecipient),
    vendorAddress: extractString(raw.VendorAddress),
    vendorAddressRecipient: extractString(raw.VendorAddressRecipient),

    // Customer info
    customerId: extractString(raw.CustomerId),
    customerName: extractString(raw.CustomerName),
    customerTaxId: extractString(raw.CustomerTaxId),

    // Vendor info
    vendorName: extractString(raw.VendorName),
    vendorTaxId: extractString(raw.VendorTaxId),

    // Invoice metadata
    countryRegion: extractString(raw.CountryRegion),
    dueDate: extractDate(raw.DueDate),
    invoiceDate: extractDate(raw.InvoiceDate),
    invoiceId: extractString(raw.InvoiceId),
    paymentTerm: extractString(raw.PaymentTerm),
    poNumber: extractString(raw.PONumber),

    // Line items
    lineItems: raw.LineItems?.valueArray?.map((lineItem) => ({
      date: extractDate(lineItem.valueObject.Date),
      description: extractString(lineItem.valueObject.Description),
      productCode: extractString(lineItem.valueObject.ProductCode),
      quantity: extractNumber(lineItem.valueObject.Quantity),
      quantityUnit: extractString(lineItem.valueObject.QuantityUnit),
      taxAmount: extractCurrencyAmount(lineItem.valueObject.TaxAmount),
      taxRate: extractNumber(lineItem.valueObject.TaxRate),
      totalAmount: extractCurrencyAmount(lineItem.valueObject.TotalAmount),
      unitPrice: extractCurrencyAmount(lineItem.valueObject.UnitPrice),
    })),

    // Tax details
    taxDetails: raw.TaxDetails?.valueArray?.map((taxDetail) => ({
      amount: extractCurrencyAmount(taxDetail.valueObject.Amount),
      description: extractString(taxDetail.valueObject.Description),
      netAmount: extractCurrencyAmount(taxDetail.valueObject.NetAmount),
      rate: extractNumber(taxDetail.valueObject.Rate),
    })),
  };
};
