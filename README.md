# Royco Dawn Simulator Template
abc
This repository contains the standardized Dawn simulator factory and its shared accountant, locked copy, design contract, market-data importer, verification checks, and certification commands.

To create a market simulator, follow [`docs/NEW_SIMULATOR.md`](docs/NEW_SIMULATOR.md). The factory commands are:

```bash
npm run sim:new -- <market-id> <csv-or-public-url>
npm run sim:verify -- <market-id>
npm run sim:preview -- <market-id>
npm run sim:certify -- <market-id>
```

The separate Royco Day template is documented in [`docs/NEW_DAY_SIMULATOR.md`](docs/NEW_DAY_SIMULATOR.md). Its commands are:

```bash
npm run day-sim:verify
npm run day-sim:preview
npm run day-sim:certify
```

Dawn and Day accounting remain isolated.

## Local development

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
