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
  bgSurface: "rgba(15, 23, 42, 0.55)",
  bgElevated: "rgba(17, 24, 39, 0.6)",
  bgGlass: "rgba(13, 21, 38, 0.75)",
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
    colorBgElevated: "#111827",
    colorBgLayout: "rgba(6, 11, 24, 0.4)",

    colorBorder: COLORS.border,
    colorBorderSecondary: "rgba(15, 23, 42, 0.6)",

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
    Modal: {
      contentBg: "rgba(13, 21, 38, 0.85)",
      headerBg: "rgba(16, 26, 48, 0.6)",
      footerBg: "rgba(16, 26, 48, 0.4)",
    },
    Drawer: {
      colorBgElevated: "rgba(13, 21, 38, 0.85)",
    },
    Table: {
      headerBg: "rgba(16, 26, 48, 0.6)",
      rowHoverBg: "rgba(37, 99, 235, 0.08)",
    },
  },
};
