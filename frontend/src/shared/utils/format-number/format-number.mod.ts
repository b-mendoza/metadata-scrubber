const MAX_DECIMAL_PLACES_IN_PRODUCT_PRICES = 2;

export const formatNumber = (number: number) => {
  return Number.parseFloat(
    number.toFixed(MAX_DECIMAL_PLACES_IN_PRODUCT_PRICES),
  );
};
