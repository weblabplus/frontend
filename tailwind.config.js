/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Medisend — TRUST_BLUE (#0072CE) ως κύριο χρώμα
        primary: {
          50: '#eaf5fd',
          100: '#cfe9fa',
          200: '#a3d5f5',
          300: '#6ebcee',
          400: '#2f9ce0',
          500: '#0d82ca',
          600: '#0072ce',
          700: '#0060ae',
          800: '#005190',
          900: '#004375',
        },
        // Medisend — CLINIC_SKY (#B2D7EF) ως δευτερεύον
        clinic: {
          50: '#f3f9fd',
          100: '#e6f2fb',
          200: '#cde6f7',
          300: '#b2d7ef',
          400: '#8ec0e6',
          500: '#66a5d8',
          600: '#4b8ec8',
          700: '#3d76a8',
          800: '#34628a',
          900: '#2c5273',
        },
        medical: {
          critical: '#dc3545',
          high: '#fd7e14',
          borderline: '#ffc107',
          normal: '#28a745',
          info: '#17a2b8',
        },
      },
      fontFamily: {
        sans: ['var(--font-geologica)', 'Geologica', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
