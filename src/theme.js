import { theme } from "antd";

// ── NetWorld design tokens ────────────────────────────────────────────────
// App type: family & friends network / relation manager.
// Palette is built on a trustworthy deep-blue primary with a cool dark base,
// keeping the project's original blue identity but refined.
export const COLORS = {
  primary: "#2563eb",
  primaryHover: "#3b82f6",
  primaryActive: "#1d4ed8",
  gradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
  sky: "#0ea5e9",

  bgDeep: "#0b1120",
  bgSurface: "#0f172a",
  bgElevated: "#111827",
  bgHover: "rgba(37, 99, 235, 0.12)",

  border: "#1e293b",
  borderStrong: "#334155",

  text: "#f1f5f9",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",

  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
};

export const FONT_FAMILY =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// ── Ant Design theme config (single source of truth) ──────────────────────
export const networldTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: COLORS.primary,
    colorInfo: COLORS.sky,
    colorSuccess: COLORS.success,
    colorWarning: COLORS.warning,
    colorError: COLORS.danger,

    colorBgBase: COLORS.bgDeep,
    colorBgContainer: COLORS.bgElevated,
    colorBgLayout: COLORS.bgDeep,

    colorBorder: COLORS.border,
    colorBorderSecondary: "#0f172a",

    colorText: COLORS.text,
    colorTextSecondary: COLORS.textSecondary,
    colorTextTertiary: COLORS.textMuted,

    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,

    controlHeight: 40,
    controlHeightLG: 46,

    fontSize: 14,
    fontFamily: FONT_FAMILY,
  },
  components: {
    Button: {
      fontWeight: 600,
      primaryShadow: "0 4px 12px rgba(37, 99, 235, 0.35)",
    },
    Input: {
      activeShadow: "0 0 0 3px rgba(37, 99, 235, 0.15)",
    },
    Card: {
      borderRadiusLG: 14,
    },
    Form: {
      itemMarginBottom: 18,
    },
  },
};
