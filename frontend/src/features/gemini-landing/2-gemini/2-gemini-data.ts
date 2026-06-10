export const GEMINI_TWO_NAV_ITEMS = ["Capabilities", "Process", "Pricing"];

export const GEMINI_TWO_MARQUEE_MARKERS = Array.from("ABCDEFGHIJ");

export const GEMINI_TWO_CAPABILITIES = [
  {
    title: "Photo OCR Engine",
    icon: "smartphone",
    desc: "Proprietary optical character recognition optimized for receipts and invoices. Turns pixels into structured JSON data instantly.",
  },
  {
    title: "3-Way Matching",
    icon: "shield",
    desc: "Automated reconciliation between Purchase Orders, Receiving Reports, and Invoices. Flag discrepancies before payment.",
  },
  {
    title: "DTE Automation",
    icon: "fileText",
    desc: "Direct integration with Ministry of Finance for immediate DTE generation and validation. Compliance guaranteed.",
  },
  {
    title: "Real-time Analytics",
    icon: "zap",
    desc: "Live dashboards tracking spend velocity, category breakdown, and vendor performance metrics.",
  },
  {
    title: "Fraud Detection",
    icon: "scan",
    desc: "AI-driven anomaly detection identifies duplicate invoices, price spikes, and unauthorized vendors.",
  },
  {
    title: "Cloud Archive",
    icon: "checkCircle",
    desc: "Secure, searchable storage for all your financial documents with 7-year retention policy built-in.",
  },
] as const;

export const GEMINI_TWO_PROCESS_STEPS = [
  {
    step: "01",
    title: "Capture",
    desc: "Snap a photo of the invoice or receipt via mobile app.",
  },
  {
    step: "02",
    title: "Process",
    desc: "AI extracts data and matches against POs automatically.",
  },
  {
    step: "03",
    title: "Approve",
    desc: "One-click approval sends data to ERP and Tax Authority.",
  },
] as const;

export const GEMINI_TWO_FOOTER_COLUMNS = [
  {
    title: "Platform",
    links: ["Features", "Integrations", "Enterprise", "Changelog"],
    className: "md:col-span-2 md:col-start-7",
  },
  {
    title: "Company",
    links: ["About", "Careers", "Contact", "Legal"],
    className: "md:col-span-2",
  },
  {
    title: "Social",
    links: ["Twitter", "LinkedIn", "GitHub", "Instagram"],
    className: "md:col-span-2",
  },
] as const;
