import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "var(--bg-primary)",
          sidebar: "var(--bg-sidebar)",
          surface: "var(--bg-surface)",
          userMessage: "var(--bg-user-message)",
          input: "var(--bg-input)",
          hover: "var(--bg-hover)",
          code: "var(--bg-code)",
        },
        border: {
          DEFAULT: "var(--border-default)",
          strong: "var(--border-strong)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          subtle: "var(--accent-subtle)",
        },
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      fontFamily: {
        sans: [
          "Söhne",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      transitionTimingFunction: {
        "ease-out-soft": "cubic-bezier(0.0, 0.0, 0.2, 1)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(0.94)" },
        },
        "bubble-pop": {
          "0%, 100%": {
            opacity: "0.55",
            transform: "translateY(8px) scale(0.88)",
          },
          "50%": {
            opacity: "1",
            transform: "translateY(-8px) scale(1)",
          },
        },
        "paper-add": {
          "0%": {
            opacity: "0",
            transform: "translateX(-50%) translateY(-18px) scale(0.96)",
          },
          "100%": {
            opacity: "1",
            transform: "translateX(-50%) translateY(0) scale(1)",
          },
        },
        "timeline-pop": {
          "0%": {
            opacity: "0",
            transform: "translateY(10px) scale(0.92)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0) scale(1)",
          },
        },
        "progress-slide": {
          "0%": { transform: "translateX(-110%)" },
          "100%": { transform: "translateX(420%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease",
        "fade-up": "fade-up 250ms cubic-bezier(0.0, 0.0, 0.2, 1)",
        "slide-in-right": "slide-in-right 250ms cubic-bezier(0.0, 0.0, 0.2, 1)",
        "pulse-slow": "pulse-slow 2.4s ease-in-out infinite",
        "bubble-pop": "bubble-pop 2.2s ease-in-out infinite",
        "paper-add": "paper-add 420ms cubic-bezier(0.0, 0.0, 0.2, 1)",
        "timeline-pop": "timeline-pop 360ms cubic-bezier(0.0, 0.0, 0.2, 1)",
        "progress-slide": "progress-slide 2.2s cubic-bezier(0.4, 0.0, 0.2, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
