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
                    DEFAULT: '#0F7FFF', // Bright Blue (User Request)
                    foreground: '#ffffff',
                },
                secondary: {
                    DEFAULT: '#031933', // Dark Navy (User Request)
                    foreground: '#ffffff',
                },
                accent: {
                    DEFAULT: '#FF4C29', // Orange/Red from snippet (inferred)
                    foreground: '#ffffff',
                },
                background: '#F5F5F5', // Light Gray
                surface: '#ffffff', // White
                text: {
                    main: '#232425',
                    muted: '#909499'
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
