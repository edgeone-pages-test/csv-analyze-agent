// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";
// import tailwind from "@tailwindcss/vite";

// export default defineConfig({
//   plugins: [react(), tailwind()],
//   // vega/vega-lite 是纯后端依赖，前端不用；排除可避免 dep optimization metadata 过大导致 431
//   optimizeDeps: {
//     exclude: ["vega", "vega-lite", "vega-util", "vega-loader", "vega-scenegraph"],
//   },
//   server: {
//     port: 5173,
//     proxy: {
//       "/upload": {
//         target: "http://localhost:8088",
//         changeOrigin: true,
//       },
//       "/analyze": {
//         target: "http://localhost:8088",
//         changeOrigin: true,
//       },
//       "/history": {
//         target: "http://localhost:8088",
//         changeOrigin: true,
//       },
//       "/static": {
//         target: "http://localhost:8088",
//         changeOrigin: true,
//       },
//     },
//   },
// });

export default {}
