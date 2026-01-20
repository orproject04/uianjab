import type { Config } from 'tailwindcss';

const config: Config = {
    // Use the standard class-based dark mode so `dark:` utilities work without custom variants.
    darkMode: 'class',
    content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
};

export default config;
