import { UTCDateMini } from "@date-fns/utc";

/**
 * @param {Date} date - The date to be converted to UTC.
 *
 * If no date is provided, the current date is used.
 */
export const getUTCDate = (date: Date = new Date()) => new UTCDateMini(date);
