/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        status: {
          ingested: 'hsl(0, 0%, 45%)',
          proposed: 'hsl(217, 91%, 60%)',
          waiting: 'hsl(48, 96%, 53%)',
          applying: 'hsl(217, 91%, 60%)',
          prOpen: 'hsl(271, 91%, 65%)',
          done: 'hsl(142, 76%, 36%)',
          blocked: 'hsl(0, 84%, 60%)',
          needsHuman: 'hsl(25, 95%, 53%)',
          failed: 'hsl(0, 84%, 60%)',
        },
      },
    },
  },
  plugins: [],
}

