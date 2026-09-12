import dayjs from "dayjs";

const ISO_FMT = "YYYY-MM-DD";
const MAX_AGE_YEARS = 150;

// "1990-01-12" -> "12 January, 1990" (long popup-preview form). Null-safe.
export function formatLongDate(iso) {
  if (!iso) return "";
  const d = dayjs(iso);
  return d.isValid() ? d.format("DD MMMM, YYYY") : "";
}

// "1990-01-12" -> "12 Jan 1990" (locale-aware short form). Null-safe.
export function formatBirthDate(iso) {
  if (!iso) return "";
  const d = dayjs(iso);
  return d.isValid() ? d.format("DD MMM YYYY") : "";
}

// Full years as of today, or null when unknown/invalid/future.
export function getAge(iso) {
  if (!iso) return null;
  const d = dayjs(iso).startOf("day");
  const today = dayjs().startOf("day");
  if (!d.isValid() || d.isAfter(today)) return null;
  return today.diff(d, "year");
}

// "12 Jan 1990 · 34 yrs" (age part omitted when unknown).
export function formatBirthDateWithAge(iso) {
  const date = formatBirthDate(iso);
  if (!date) return "";
  const age = getAge(iso);
  return age === null ? date : `${date} · ${age} yrs`;
}

// Shared antd Form rule: optional, but when picked must be a past date
// within a sane human range (mirrors backend validation).
export function birthDateValidator() {
  return {
    validator: (_, value) => {
      if (!value) return Promise.resolve();
      const d = dayjs(value).startOf("day");
      if (!d.isValid()) return Promise.reject("Please enter a valid date!");
      const today = dayjs().startOf("day");
      if (d.isAfter(today)) return Promise.reject("Birth date cannot be in the future!");
      if (d.isBefore(today.subtract(MAX_AGE_YEARS, "year"))) {
        return Promise.reject("Please enter a valid birth date!");
      }
      return Promise.resolve();
    },
  };
}

// dayjs -> "YYYY-MM-DD" (or undefined when empty) for API payloads.
export function toBirthDateParam(value) {
  return value ? dayjs(value).format(ISO_FMT) : undefined;
}

// "YYYY-MM-DD" -> dayjs (or null) for DatePicker initial values.
export function toBirthDatePickerValue(iso) {
  return iso ? dayjs(iso) : null;
}

// Disable future days in DatePickers (past dates only).
export function disableFutureDates(current) {
  return current && current.isAfter(dayjs(), "day");
}
