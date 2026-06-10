const DECIMAL_PLACES = 2;

export const currencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: DECIMAL_PLACES,
  minimumFractionDigits: DECIMAL_PLACES,
  style: "currency",
});

const CENTS_TO_FORMAT = 100; // We're dividing the amount by 100 to format the amount in cents and make it human-readable.

/**
 * Format cents to a float currency value.
 *
 * @param {number} amount - The amount in cents.
 */
export const centsFormatter = (amount: number) => amount / CENTS_TO_FORMAT;
