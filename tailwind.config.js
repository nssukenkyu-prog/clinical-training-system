/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#0ea5e9', // Sky 500
                    foreground: '#ffffff',
                },
                secondary: {
                    DEFAULT: '#64748b', // Slate 500
                    foreground: '#ffffff',
                },
                accent: {
                    DEFAULT: '#f43f5e', // Rose 500
                    foreground: '#ffffff',
                },
                background: '#0f172a', // Slate 900
                surface: '#1e293b', // Slate 800
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
