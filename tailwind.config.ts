import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: ".5625rem",
        md: ".375rem",
        sm: ".1875rem",
      },
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        card: {
          DEFAULT: token("card"),
          foreground: token("card-foreground"),
          border: token("card-border"),
        },
        popover: {
          DEFAULT: token("popover"),
          foreground: token("popover-foreground"),
          border: token("popover-border"),
        },
        primary: {
          DEFAULT: token("primary"),
          foreground: token("primary-foreground"),
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: token("secondary"),
          foreground: token("secondary-foreground"),
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground"),
          border: "var(--muted-border)",
        },
        accent: {
          DEFAULT: token("accent"),
          foreground: token("accent-foreground"),
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: token("destructive"),
          foreground: token("destructive-foreground"),
          border: "var(--destructive-border)",
        },
        // Nomes herdados do módulo de envios (antigo OM-Shipment).
        primaryVariant: token("primary-variant"),
        surface: token("surface"),
        error: token("destructive"),
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
