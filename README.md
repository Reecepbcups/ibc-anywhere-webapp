# ibc-anywhere

A simple website interface for transferring tokens with IBC.
The goal is to make it super simple to transfer a token from any network to any other network in which a relayer channel is already setup.

Currently, the only way to do this is with JunoSwap, Osmosis, but that only transfers to a single network. If you want to transfer your ATOM to a network without a DEX interface, you have to do it manually in Keplr / CLI. This removes that requirement.

In the future, add support for IBCMemo

Goal: Make it a few clicks (<4-5) to transfer an IBC packet for ICS-20 (native tokens) to another chain which has a relayer.

---

Everything you need to build a Svelte project, powered by [`create-svelte`](https://github.com/sveltejs/kit/tree/master/packages/create-svelte).

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://kit.svelte.dev/docs/adapters) for your target environment.
