import {
  CameraIcon,
  FileTextIcon,
  GlobeIcon,
  LockIcon,
  ShieldCheckIcon,
  ZapIcon,
} from "lucide-react";

const CHART_BARS = 20;
const CHART_MAX_HEIGHT = 100;
const CHART_HEIGHT_BASE_RATIO = 0.45;
const CHART_HEIGHT_STEP_MULTIPLIER = 17;
const CHART_HEIGHT_VARIANCE_MODULUS = 50;
const PERCENT_DIVISOR = 100;
const CHART_BASE_OPACITY = 0.5;
const CHART_RANDOM_OPACITY = 0.5;
const CHART_OPACITY_GROUP_SIZE = 5;

export const SCROLL_THRESHOLD = 20;
export const TICKER_MARKERS = Array.from("ABCDEFGHIJ");
export const NAV_LINKS = ["Product", "Solutions", "Pricing", "Company"];
export const CHART_DATA = Array.from({ length: CHART_BARS }, (_, index) => ({
  id: `bar-${index}`,
  height:
    CHART_MAX_HEIGHT *
    (CHART_HEIGHT_BASE_RATIO +
      ((index * CHART_HEIGHT_STEP_MULTIPLIER) % CHART_HEIGHT_VARIANCE_MODULUS) /
        PERCENT_DIVISOR),
  opacity:
    CHART_BASE_OPACITY +
    ((index % CHART_OPACITY_GROUP_SIZE) * CHART_RANDOM_OPACITY) /
      CHART_OPACITY_GROUP_SIZE,
}));

export const FEATURE_ITEMS = [
  {
    icon: <CameraIcon />,
    title: "Photo OCR Engine",
    desc: "Military-grade text recognition for instant invoice digitization.",
    number: "01",
  },
  {
    icon: <ShieldCheckIcon />,
    title: "3-Way Match",
    desc: "Automated reconciliation of POs, receipts, and invoices.",
    number: "02",
    active: true,
  },
  {
    icon: <FileTextIcon />,
    title: "DTE Automation",
    desc: "Direct integration with Ministry of Finance systems.",
    number: "03",
  },
  {
    icon: <ZapIcon />,
    title: "Real-time Analytics",
    desc: "Live spend tracking and anomaly detection algorithms.",
    number: "04",
  },
  {
    icon: <GlobeIcon />,
    title: "Global Access",
    desc: "Secure, encrypted remote access from any terminal.",
    number: "05",
  },
  {
    icon: <LockIcon />,
    title: "Vault Security",
    desc: "End-to-end encryption for your most sensitive data.",
    number: "06",
  },
];
