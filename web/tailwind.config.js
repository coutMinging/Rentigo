import animate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"PingFang SC"',
          '"Helvetica Neue"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
      colors: {
        ink: {
          DEFAULT: '#1F2437',
          soft: '#5A6172',
          mute: '#98A0B3',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 12px 32px rgba(16,24,40,0.06)',
        'card-hover': '0 2px 4px rgba(16,24,40,0.06), 0 18px 44px rgba(16,24,40,0.10)',
      },
      borderRadius: {
        '4xl': '28px',
      },
    },
  },
  plugins: [animate],
}
