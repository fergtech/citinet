# Local Mesh Node App

A mobile-first web application for local mesh network communities. This app provides a social platform for community members to connect, share updates, and discover local businesses and events.

## Features

- Welcome screen with animated local network branding
- Dashboard with featured content carousel
- Community feed with image, video, and text posts
- Category filtering
- Mobile-optimized interface with glassmorphism design
- Dark mode support

## Getting Started

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000/` and should open automatically in your browser.

### Troubleshooting

If you see "localhost refused to connect":

1. **Check your terminal** - Look for any red error messages after "VITE ready"
2. **Try these URLs**:
   - http://localhost:3000/
   - http://127.0.0.1:3000/
   - Check the terminal for the actual port (it may use 3001, 3002, etc. if 3000 is busy)
3. **Clear the cache** - Delete `node_modules/.vite` folder and restart
4. **Check firewall** - Make sure Windows Firewall isn't blocking Node.js
5. **Run as administrator** - Try running your terminal as administrator

### Build for Production

```bash
npm run build
```

## Technology Stack

- React 18.3
- TypeScript
- Vite
- Tailwind CSS 4
- Motion (animations)
- Lucide React (icons)
- React Slick (carousel)

## License

See ATTRIBUTIONS.md for third-party licenses and credits.
