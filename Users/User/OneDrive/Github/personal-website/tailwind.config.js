export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        float: {
          '0%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-25px)' },
          '100%': { transform: 'translateY(0)' },
        },
        float2: {
          '0%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-15px)' },
          '100%': { transform: 'translateY(0)' },
        },
        float3: {
          '0%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        float: 'float 3s infinite ease-in-out',
        float2: 'float2 4s infinite ease-in-out',
        float3: 'float3 2s infinite ease-in-out',
      },
    },
  },
  plugins: [],
};