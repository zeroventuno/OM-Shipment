/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#6200EE', // Material Design Purple 500
                primaryVariant: '#3700B3', // Purple 700
                secondary: '#03DAC6', // Teal 200
                background: '#F5F5F5',
                surface: '#FFFFFF',
                error: '#B00020',
            },
            fontFamily: {
                sans: ['Roboto', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
